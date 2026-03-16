const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PLUGIN_ID = "trae-ide";
const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_READY_TIMEOUT_MS = 45000;
const DEFAULT_REQUEST_TIMEOUT_MS = 180000;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstObject(candidates) {
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) {
      return candidate;
    }
  }
  return {};
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function normalizeInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.trunc(numeric) : fallback;
}

function normalizeBaseUrl(value) {
  const normalized = String(value || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return normalized.replace(/\/+$/, "");
}

function getBundledQuickstartDefaults() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const windowsLauncher = path.join(repoRoot, "start-traeapi.cmd");
  if (fs.existsSync(windowsLauncher)) {
    return {
      quickstartCommand: `"${windowsLauncher}"`,
      quickstartCwd: repoRoot
    };
  }

  const quickstartScript = path.join(repoRoot, "scripts", "quickstart.js");
  if (fs.existsSync(quickstartScript)) {
    return {
      quickstartCommand: `"${process.execPath}" "${quickstartScript}"`,
      quickstartCwd: repoRoot
    };
  }

  return {
    quickstartCommand: "",
    quickstartCwd: ""
  };
}

function readPluginConfig(api) {
  const directConfig = firstObject([api?.pluginConfig, api?.entry?.config, api?.plugin?.config]);
  const configFromRoot = firstObject([
    api?.config?.plugins?.entries?.[PLUGIN_ID]?.config,
    api?.config?.plugins?.entries?.["trae-ide"]?.config
  ]);
  return {
    ...configFromRoot,
    ...directConfig
  };
}

function resolvePluginRuntimeConfig(api) {
  const rawConfig = readPluginConfig(api);
  const defaultQuickstart = getBundledQuickstartDefaults();
  return {
    pluginId: PLUGIN_ID,
    baseUrl: normalizeBaseUrl(rawConfig.baseUrl || process.env.TRAE_API_BASE_URL || DEFAULT_BASE_URL),
    token: String(rawConfig.token || process.env.TRAE_API_TOKEN || "").trim(),
    autoStart: normalizeBoolean(rawConfig.autoStart ?? process.env.TRAE_API_AUTOSTART, false),
    quickstartCommand: String(rawConfig.quickstartCommand || process.env.TRAE_API_QUICKSTART_COMMAND || defaultQuickstart.quickstartCommand).trim(),
    quickstartCwd: String(rawConfig.quickstartCwd || process.env.TRAE_API_QUICKSTART_CWD || defaultQuickstart.quickstartCwd).trim(),
    readyTimeoutMs: normalizeInteger(rawConfig.readyTimeoutMs || process.env.TRAE_API_READY_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_MS),
    requestTimeoutMs: normalizeInteger(rawConfig.requestTimeoutMs || process.env.TRAE_API_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS)
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildHeaders(config, extraHeaders = {}) {
  const headers = {
    Accept: "application/json",
    ...extraHeaders
  };
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }
  return headers;
}

async function readJsonResponse(response) {
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    text,
    json: text ? JSON.parse(text) : null
  };
}

function normalizeChunks(result) {
  return Array.isArray(result?.data?.result?.chunks)
    ? result.data.result.chunks.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function uniqueNormalizedList(items = []) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const normalized = String(item || "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function stripDuplicateFinalText(chunks, finalText) {
  const normalizedFinal = String(finalText || "").trim();
  if (!normalizedFinal) {
    return uniqueNormalizedList(chunks);
  }
  return uniqueNormalizedList(chunks).filter((chunk) => chunk !== normalizedFinal);
}

function formatListSection(title, items) {
  if (!items.length) {
    return "";
  }
  return `${title}\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;
}

function formatStatusToolResult(status) {
  const lines = [
    "TraeAPI status",
    `Base URL: ${status.baseUrl}`,
    `Gateway reachable: ${status.gatewayReachable ? "yes" : "no"}`,
    `Automation ready: ${status.ready ? "yes" : "no"}`
  ];

  if (status.autoStarted) {
    lines.push("Auto-start attempted: yes");
  }
  if (status.healthSummary) {
    lines.push(`Health: ${status.healthSummary}`);
  }
  if (status.readySummary) {
    lines.push(`Ready detail: ${status.readySummary}`);
  }
  if (status.errorMessage) {
    lines.push(`Error: ${status.errorMessage}`);
  }

  return lines.join("\n");
}

function formatDelegateToolResult(result) {
  const data = result?.data || {};
  const finalText = String(data?.result?.response?.text || "").trim();
  const processItems = stripDuplicateFinalText(normalizeChunks(result), finalText);
  const sections = [
    "Trae task completed.",
    `Session ID: ${data.sessionId || "unknown"}`,
    `Request ID: ${data.requestId || "unknown"}`,
    `Session created: ${data.sessionCreated === true ? "yes" : "no"}`
  ];

  if (finalText) {
    sections.push(`Final reply\n${finalText}`);
  }

  const processSection = formatListSection("Process text", processItems);
  if (processSection) {
    sections.push(processSection);
  }

  return sections.join("\n\n");
}

class TraeApiClient {
  constructor(config) {
    this.config = config;
  }

  async request(pathname, options = {}) {
    const controller = new AbortController();
    const timeoutMs = normalizeInteger(options.timeoutMs, this.config.requestTimeoutMs);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}${pathname}`, {
        method: options.method || "GET",
        headers: buildHeaders(this.config, options.headers),
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });
      return await readJsonResponse(response);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Timed out while requesting ${pathname} from ${this.config.baseUrl}`);
      }
      throw new Error(`Failed to reach TraeAPI at ${this.config.baseUrl}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async startQuickstart() {
    if (!this.config.quickstartCommand) {
      throw new Error(
        "TraeAPI is not ready and no quickstartCommand is configured. Start TraeAPI first or configure plugins.entries.trae-ide.config.quickstartCommand."
      );
    }

    const child = spawn(this.config.quickstartCommand, {
      cwd: this.config.quickstartCwd || process.cwd(),
      detached: true,
      stdio: "ignore",
      shell: true,
      windowsHide: true
    });
    child.unref();
  }

  async waitForReady(deadlineMs) {
    const startedAt = Date.now();
    let lastReady = null;
    while (Date.now() - startedAt < deadlineMs) {
      lastReady = await this.request("/ready", {
        timeoutMs: 5000
      }).catch((error) => ({
        ok: false,
        status: 0,
        json: null,
        text: "",
        error
      }));

      if (lastReady.ok) {
        return lastReady;
      }

      await sleep(1000);
    }

    return lastReady;
  }

  async ensureReady({ allowAutoStart = false } = {}) {
    const readyResponse = await this.request("/ready", {
      timeoutMs: 5000
    }).catch((error) => ({
      ok: false,
      status: 0,
      json: null,
      text: "",
      error
    }));

    if (readyResponse.ok) {
      return {
        ready: true,
        autoStarted: false,
        readyResponse
      };
    }

    if (!allowAutoStart || !this.config.autoStart) {
      return {
        ready: false,
        autoStarted: false,
        readyResponse
      };
    }

    await this.startQuickstart();
    const waitedReady = await this.waitForReady(this.config.readyTimeoutMs);
    return {
      ready: Boolean(waitedReady?.ok),
      autoStarted: true,
      readyResponse: waitedReady
    };
  }

  async getStatus({ allowAutoStart = false } = {}) {
    const readiness = await this.ensureReady({ allowAutoStart });
    const healthResponse = await this.request("/health", {
      timeoutMs: 5000
    }).catch(() => null);

    return {
      baseUrl: this.config.baseUrl,
      gatewayReachable: Boolean(healthResponse?.ok),
      ready: readiness.ready,
      autoStarted: readiness.autoStarted,
      healthSummary: healthResponse?.json?.data?.status || healthResponse?.json?.data?.service || "",
      readySummary:
        readiness.readyResponse?.json?.data?.automation?.mode ||
        readiness.readyResponse?.json?.message ||
        readiness.readyResponse?.json?.code ||
        "",
      errorMessage:
        readiness.readyResponse?.json?.message ||
        readiness.readyResponse?.json?.details?.message ||
        readiness.readyResponse?.error?.message ||
        ""
    };
  }

  async delegateTask({ task, sessionId, allowAutoStart = true }) {
    if (typeof task !== "string" || !task.trim()) {
      throw new Error("trae_delegate requires a non-empty task string");
    }

    const readiness = await this.ensureReady({ allowAutoStart });
    if (!readiness.ready) {
      const errorMessage =
        readiness.readyResponse?.json?.message ||
        readiness.readyResponse?.json?.details?.message ||
        readiness.readyResponse?.error?.message ||
        `TraeAPI at ${this.config.baseUrl} is not ready`;
      throw new Error(errorMessage);
    }

    const response = await this.request("/v1/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        content: task,
        ...(sessionId ? { sessionId } : {}),
        sessionMetadata: {
          client: "openclaw-trae-plugin"
        },
        metadata: {
          caller: "openclaw-trae-plugin"
        }
      }
    });

    if (!response.ok || !response.json?.success) {
      throw new Error(response.json?.message || `TraeAPI request failed with status ${response.status}`);
    }

    return response.json;
  }
}

function createTraeApiClient(config) {
  return new TraeApiClient(config);
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  PLUGIN_ID,
  TraeApiClient,
  createTraeApiClient,
  formatDelegateToolResult,
  formatStatusToolResult,
  resolvePluginRuntimeConfig,
  stripDuplicateFinalText
};
