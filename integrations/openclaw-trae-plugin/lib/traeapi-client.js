const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PLUGIN_ID = "traeclaw";
const LEGACY_PLUGIN_IDS = ["trae-ide"];
const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_READY_TIMEOUT_MS = 45000;
const DEFAULT_REQUEST_TIMEOUT_MS = 180000;
const DEFAULT_UPDATE_CHECK_TIMEOUT_MS = 2500;
const DEFAULT_UPDATE_COMMAND_TIMEOUT_MS = 120000;
const DEFAULT_AUTO_UPDATE_START_DELAY_MS = 30000;
const DEFAULT_AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_NPM_REGISTRY_BASE_URL = "https://registry.npmjs.org";
const UPDATE_CHECK_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
const UPDATE_CHECK_FAILURE_TTL_MS = 15 * 60 * 1000;
const pluginUpdateCache = new Map();
const pluginRuntimeStates = new Map();

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

function normalizeNonNegativeInteger(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : fallback;
}

function normalizeBaseUrl(value) {
  const normalized = String(value || DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL;
  return normalized.replace(/\/+$/, "");
}

function normalizeOptionalString(value) {
  const normalized = String(value || "").trim();
  return normalized || "";
}

function quoteShellPath(value) {
  return `"${String(value || "").replaceAll("\\\"", "\\\\\\\"")}"`;
}

function readInstalledPluginPackageMetadata(options = {}) {
  const packageRoot = path.resolve(options.packageRoot || path.join(__dirname, ".."));
  const packageJsonPath = path.join(packageRoot, "package.json");

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return {
      packageName: normalizeOptionalString(packageJson.name),
      version: normalizeOptionalString(packageJson.version)
    };
  } catch {
    return {
      packageName: "",
      version: ""
    };
  }
}

function parseSemanticVersion(value) {
  const normalized = normalizeOptionalString(value).replace(/^v/i, "");
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(normalized);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : []
  };
}

function comparePrereleaseIdentifiers(leftIdentifiers, rightIdentifiers) {
  const maxLength = Math.max(leftIdentifiers.length, rightIdentifiers.length);
  for (let index = 0; index < maxLength; index += 1) {
    const left = leftIdentifiers[index];
    const right = rightIdentifiers[index];

    if (left === undefined) {
      return -1;
    }
    if (right === undefined) {
      return 1;
    }

    const leftIsNumeric = /^\d+$/.test(left);
    const rightIsNumeric = /^\d+$/.test(right);
    if (leftIsNumeric && rightIsNumeric) {
      const numericComparison = Number(left) - Number(right);
      if (numericComparison !== 0) {
        return numericComparison > 0 ? 1 : -1;
      }
      continue;
    }
    if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    }

    const lexicalComparison = left.localeCompare(right);
    if (lexicalComparison !== 0) {
      return lexicalComparison > 0 ? 1 : -1;
    }
  }

  return 0;
}

function compareSemanticVersions(leftVersion, rightVersion) {
  const left = parseSemanticVersion(leftVersion);
  const right = parseSemanticVersion(rightVersion);
  if (!left || !right) {
    const normalizedLeft = normalizeOptionalString(leftVersion);
    const normalizedRight = normalizeOptionalString(rightVersion);
    if (normalizedLeft === normalizedRight) {
      return 0;
    }
    return normalizedLeft.localeCompare(normalizedRight);
  }

  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) {
      return left[field] > right[field] ? 1 : -1;
    }
  }

  const leftHasPrerelease = left.prerelease.length > 0;
  const rightHasPrerelease = right.prerelease.length > 0;
  if (!leftHasPrerelease && !rightHasPrerelease) {
    return 0;
  }
  if (!leftHasPrerelease) {
    return 1;
  }
  if (!rightHasPrerelease) {
    return -1;
  }

  return comparePrereleaseIdentifiers(left.prerelease, right.prerelease);
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = normalizeInteger(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl || fetch)(url, {
      method: options.method || "GET",
      headers: options.headers,
      signal: controller.signal
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      json: text ? JSON.parse(text) : null
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timed out while requesting ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchLatestPublishedVersion(options = {}) {
  const packageName = normalizeOptionalString(options.packageName);
  if (!packageName) {
    throw new Error("Package name is required for update checks");
  }

  const registryBaseUrl = normalizeBaseUrl(options.registryBaseUrl || DEFAULT_NPM_REGISTRY_BASE_URL);
  const encodedPackageName = packageName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const response = await fetchJsonWithTimeout(`${registryBaseUrl}/${encodedPackageName}`, {
    timeoutMs: normalizeInteger(options.timeoutMs, DEFAULT_UPDATE_CHECK_TIMEOUT_MS),
    fetchImpl: options.fetchImpl,
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`npm registry returned status ${response.status}`);
  }

  const latestVersion = normalizeOptionalString(response.json?.["dist-tags"]?.latest);
  if (!latestVersion) {
    throw new Error("npm registry response did not include dist-tags.latest");
  }

  return {
    packageName,
    latestVersion
  };
}

function summarizeCommandOutput(stdout, stderr) {
  const lines = [normalizeOptionalString(stdout), normalizeOptionalString(stderr)].filter(Boolean);
  return lines.join("\n").trim();
}

function getPluginRuntimeStateKey(options = {}) {
  return path.resolve(options.packageRoot || path.join(__dirname, ".."));
}

function getPluginRuntimeState(options = {}) {
  const stateKey = getPluginRuntimeStateKey(options);
  if (!pluginRuntimeStates.has(stateKey)) {
    pluginRuntimeStates.set(stateKey, {
      stateKey,
      pendingRestart: false,
      autoApplyEnabled: false,
      autoUpdateScheduled: false,
      autoUpdateTimer: null,
      autoUpdateInFlight: null,
      lastUpdateStatus: "",
      lastUpdateMessage: "",
      lastUpdateSource: "",
      lastUpdateCheckAt: "",
      lastUpdateAttemptAt: "",
      lastKnownCurrentVersion: "",
      lastKnownLatestVersion: ""
    });
  }
  return pluginRuntimeStates.get(stateKey);
}

function updatePluginRuntimeState(options = {}, patch = {}) {
  const state = getPluginRuntimeState(options);
  Object.assign(state, patch);
  return state;
}

function snapshotPluginRuntimeState(options = {}) {
  const state = getPluginRuntimeState(options);
  return {
    pendingRestart: state.pendingRestart === true,
    autoApplyEnabled: state.autoApplyEnabled === true,
    lastUpdateStatus: normalizeOptionalString(state.lastUpdateStatus),
    lastUpdateMessage: normalizeOptionalString(state.lastUpdateMessage),
    lastUpdateSource: normalizeOptionalString(state.lastUpdateSource),
    lastUpdateCheckAt: normalizeOptionalString(state.lastUpdateCheckAt),
    lastUpdateAttemptAt: normalizeOptionalString(state.lastUpdateAttemptAt),
    lastKnownCurrentVersion: normalizeOptionalString(state.lastKnownCurrentVersion),
    lastKnownLatestVersion: normalizeOptionalString(state.lastKnownLatestVersion)
  };
}

function resolveBundledRuntimeRoot(options = {}) {
  const packageRoot = path.resolve(options.packageRoot || path.join(__dirname, ".."));
  const bundledRuntimeRoot = path.join(packageRoot, "runtime", "traeapi");
  if (fs.existsSync(path.join(bundledRuntimeRoot, "scripts", "quickstart.js"))) {
    return bundledRuntimeRoot;
  }

  const sourceRepoRoot = path.resolve(packageRoot, "..", "..");
  if (
    fs.existsSync(path.join(sourceRepoRoot, "scripts", "quickstart.js")) &&
    fs.existsSync(path.join(sourceRepoRoot, "integrations", "openclaw-trae-plugin", "index.js"))
  ) {
    return sourceRepoRoot;
  }

  return "";
}

function getBundledQuickstartDefaults(options = {}) {
  const repoRoot = resolveBundledRuntimeRoot(options);
  const platform = options.platform || process.platform;
  const nodeExecPath = options.execPath || process.execPath;
  if (!repoRoot) {
    return {
      quickstartCommand: "",
      quickstartCwd: ""
    };
  }
  const windowsLauncher = path.join(repoRoot, "start-traeapi.cmd");
  const macLauncher = path.join(repoRoot, "start-traeapi.command");
  const posixLauncher = path.join(repoRoot, "start-traeapi.sh");

  if (platform === "win32" && fs.existsSync(windowsLauncher)) {
    return {
      quickstartCommand: quoteShellPath(windowsLauncher),
      quickstartCwd: repoRoot
    };
  }

  if (platform === "darwin" && fs.existsSync(macLauncher)) {
    return {
      quickstartCommand: quoteShellPath(macLauncher),
      quickstartCwd: repoRoot
    };
  }

  if (platform !== "win32" && fs.existsSync(posixLauncher)) {
    return {
      quickstartCommand: quoteShellPath(posixLauncher),
      quickstartCwd: repoRoot
    };
  }

  const quickstartScript = path.join(repoRoot, "scripts", "quickstart.js");
  if (fs.existsSync(quickstartScript)) {
    return {
      quickstartCommand: `${quoteShellPath(nodeExecPath)} ${quoteShellPath(quickstartScript)}`,
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
  const configFromRoot = {};
  const configuredEntries = api?.config?.plugins?.entries;
  for (const pluginId of [...LEGACY_PLUGIN_IDS, PLUGIN_ID]) {
    const entryConfig = configuredEntries?.[pluginId]?.config;
    if (isPlainObject(entryConfig)) {
      Object.assign(configFromRoot, entryConfig);
    }
  }
  return {
    ...configFromRoot,
    ...directConfig
  };
}

function resolvePluginRuntimeConfig(api) {
  const rawConfig = readPluginConfig(api);
  const defaultQuickstart = getBundledQuickstartDefaults();
  const packageRoot = path.resolve(__dirname, "..");
  const packageMetadata = readInstalledPluginPackageMetadata({
    packageRoot
  });
  const resolvedConfig = {
    pluginId: PLUGIN_ID,
    packageRoot,
    packageName: packageMetadata.packageName || "traeclaw",
    pluginVersion: packageMetadata.version,
    baseUrl: normalizeBaseUrl(rawConfig.baseUrl || process.env.TRAE_API_BASE_URL || DEFAULT_BASE_URL),
    token: String(rawConfig.token || process.env.TRAE_API_TOKEN || "").trim(),
    autoStart: normalizeBoolean(rawConfig.autoStart ?? process.env.TRAE_API_AUTOSTART, false),
    openclawCommand:
      normalizeOptionalString(rawConfig.openclawCommand || process.env.TRAE_API_OPENCLAW_COMMAND || process.env.OPENCLAW_COMMAND) ||
      "openclaw",
    quickstartCommand: String(rawConfig.quickstartCommand || process.env.TRAE_API_QUICKSTART_COMMAND || defaultQuickstart.quickstartCommand).trim(),
    quickstartCwd: String(rawConfig.quickstartCwd || process.env.TRAE_API_QUICKSTART_CWD || defaultQuickstart.quickstartCwd).trim(),
    readyTimeoutMs: normalizeInteger(rawConfig.readyTimeoutMs || process.env.TRAE_API_READY_TIMEOUT_MS, DEFAULT_READY_TIMEOUT_MS),
    requestTimeoutMs: normalizeInteger(rawConfig.requestTimeoutMs || process.env.TRAE_API_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    checkForUpdates: normalizeBoolean(rawConfig.checkForUpdates ?? process.env.TRAE_API_UPDATE_CHECK_ENABLED, true),
    autoApplyUpdates: normalizeBoolean(rawConfig.autoApplyUpdates ?? process.env.TRAE_API_AUTO_APPLY_UPDATES, false),
    updateCheckTimeoutMs: normalizeInteger(
      rawConfig.updateCheckTimeoutMs || process.env.TRAE_API_UPDATE_CHECK_TIMEOUT_MS,
      DEFAULT_UPDATE_CHECK_TIMEOUT_MS
    ),
    updateCommandTimeoutMs: normalizeInteger(
      rawConfig.updateCommandTimeoutMs || process.env.TRAE_API_UPDATE_COMMAND_TIMEOUT_MS,
      DEFAULT_UPDATE_COMMAND_TIMEOUT_MS
    ),
    autoUpdateStartDelayMs: normalizeNonNegativeInteger(
      rawConfig.autoUpdateStartDelayMs ?? process.env.TRAE_API_AUTO_UPDATE_START_DELAY_MS,
      DEFAULT_AUTO_UPDATE_START_DELAY_MS
    ),
    autoUpdateIntervalMs: normalizeNonNegativeInteger(
      rawConfig.autoUpdateIntervalMs ?? process.env.TRAE_API_AUTO_UPDATE_INTERVAL_MS,
      DEFAULT_AUTO_UPDATE_INTERVAL_MS
    )
  };
  updatePluginRuntimeState(resolvedConfig, {
    autoApplyEnabled: resolvedConfig.autoApplyUpdates === true
  });
  return resolvedConfig;
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
    "TraeClaw status",
    `Base URL: ${status.baseUrl}`,
    `Gateway reachable: ${status.gatewayReachable ? "yes" : "no"}`,
    `Automation ready: ${status.ready ? "yes" : "no"}`
  ];
  const updateInfo = status.updateInfo || {};

  if (status.autoStarted) {
    lines.push("Auto-start attempted: yes");
  }
  if (updateInfo.currentVersion) {
    lines.push(`Plugin version: ${updateInfo.currentVersion}`);
  }
  lines.push(`Auto-update: ${updateInfo.autoApplyEnabled ? "enabled" : "disabled"}`);
  if (updateInfo.disabled) {
    lines.push("Update check: disabled");
  } else if (updateInfo.latestVersion) {
    lines.push(`Latest plugin version: ${updateInfo.latestVersion}`);
    lines.push(`Update available: ${updateInfo.updateAvailable ? "yes" : "no"}`);
  } else if (updateInfo.errorMessage) {
    lines.push("Update check: unavailable");
  }
  if (updateInfo.lastUpdateStatus) {
    lines.push(`Last update status: ${updateInfo.lastUpdateStatus}`);
  }
  if (updateInfo.lastUpdateSource) {
    lines.push(`Last update source: ${updateInfo.lastUpdateSource}`);
  }
  if (updateInfo.lastUpdateCheckAt) {
    lines.push(`Last update check: ${updateInfo.lastUpdateCheckAt}`);
  }
  if (updateInfo.lastUpdateAttemptAt) {
    lines.push(`Last update attempt: ${updateInfo.lastUpdateAttemptAt}`);
  }
  if (updateInfo.pendingRestart) {
    lines.push("Restart OpenClaw Gateway: yes");
  }
  if (updateInfo.lastUpdateMessage) {
    lines.push(`Update detail: ${updateInfo.lastUpdateMessage}`);
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

function formatNewChatToolResult(result) {
  const data = result?.data || {};
  const session = data.session || {};
  const preparation = data.preparation || {};
  const lines = [
    "New Trae chat created.",
    `Session ID: ${session.sessionId || "unknown"}`,
    `Prepared in Trae: ${data.prepared === true ? "yes" : "no"}`
  ];

  if (preparation.requestId) {
    lines.push(`Request ID: ${preparation.requestId}`);
  }
  if (preparation.preparation?.trigger) {
    lines.push(`Trigger: ${preparation.preparation.trigger}`);
  }

  return lines.join("\n");
}

function extractHealthWindowTitle(response) {
  const candidates = [
    response?.json?.data?.automation?.target?.title,
    response?.json?.data?.automation?.snapshot?.lastReadiness?.target?.title
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function matchesProjectWindowTitle(windowTitle, projectName) {
  const normalizedTitle = String(windowTitle || "").trim().toLowerCase();
  const normalizedProjectName = String(projectName || "").trim().toLowerCase();
  return Boolean(normalizedTitle && normalizedProjectName && normalizedTitle.includes(normalizedProjectName));
}

function readResponseErrorMessage(response, fallbackMessage) {
  return (
    response?.json?.message ||
    response?.json?.details?.message ||
    response?.error?.message ||
    fallbackMessage
  );
}

function resolveReplyText(result) {
  const responseText = String(result?.data?.result?.response?.text || "").trim();
  if (responseText) {
    return responseText;
  }

  const chunks = normalizeChunks(result);
  return chunks.length > 0 ? chunks[chunks.length - 1] : "";
}

function formatDelegateToolResult(result, options = {}) {
  const data = result?.data || {};
  const includeProcessText = options.includeProcessText === true;
  const replyText = resolveReplyText(result);
  const processItems = stripDuplicateFinalText(normalizeChunks(result), replyText);

  if (!includeProcessText) {
    return replyText || "Trae task completed.";
  }

  const sections = [
    "Trae task completed.",
    `Session ID: ${data.sessionId || "unknown"}`,
    `Request ID: ${data.requestId || "unknown"}`,
    `Session created: ${data.sessionCreated === true ? "yes" : "no"}`
  ];

  if (replyText) {
    sections.push(`Final reply\n${replyText}`);
  }

  const processSection = formatListSection("Process text", processItems);
  if (processSection) {
    sections.push(processSection);
  }

  return sections.join("\n\n");
}

function formatOpenProjectToolResult(result) {
  const lines = [
    result.alreadyOpen ? "Trae project is already open." : "Trae project opened.",
    `Project: ${result.projectName || "unknown"}`,
    `Path: ${result.projectPath || "unknown"}`,
    `Gateway ready: ${result.ready ? "yes" : "no"}`
  ];

  if (result.windowTitle) {
    lines.push(`Window title: ${result.windowTitle}`);
  }
  if (result.autoStarted) {
    lines.push("Quickstart triggered: yes");
  }

  return lines.join("\n");
}

function formatSwitchModeToolResult(result) {
  const data = result?.data || {};
  const changed = data.changed === true;
  const lines = [
    changed ? "Trae mode switched." : "Trae mode already active.",
    `Current mode: ${data.mode || "unknown"}`,
    `Previous mode: ${data.previousMode || "unknown"}`,
    `Changed: ${changed ? "yes" : "no"}`
  ];

  if (data.target?.title) {
    lines.push(`Window title: ${data.target.title}`);
  }
  if (result?.autoStarted) {
    lines.push("Quickstart triggered: yes");
  }

  return lines.join("\n");
}

function formatUpdateToolResult(result) {
  const lines = [
    result.alreadyLatest ? "TraeClaw plugin is already up to date." : result.changed ? "TraeClaw plugin updated." : "TraeClaw plugin update finished.",
    `Plugin: ${result.pluginId || PLUGIN_ID}`,
    `Package: ${result.packageName || "unknown"}`,
    `Installed version: ${result.installedVersion || "unknown"}`
  ];

  if (result.previousVersion) {
    lines.push(`Previous version: ${result.previousVersion}`);
  }
  if (result.latestVersion) {
    lines.push(`Latest plugin version: ${result.latestVersion}`);
  }
  lines.push(`Changed: ${result.changed ? "yes" : "no"}`);
  if (result.restartRequired) {
    lines.push("Restart OpenClaw Gateway: yes");
  }
  if (result.warningMessage) {
    lines.push(`Warning: ${result.warningMessage}`);
  }
  if (result.commandOutputSummary) {
    lines.push(`CLI detail: ${result.commandOutputSummary}`);
  }

  return lines.join("\n");
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
      throw new Error(`Failed to reach TraeClaw at ${this.config.baseUrl}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  getInstalledPluginMetadata() {
    const installed = readInstalledPluginPackageMetadata({
      packageRoot: this.config.packageRoot
    });
    return {
      packageName: installed.packageName || normalizeOptionalString(this.config.packageName) || "traeclaw",
      version: installed.version || normalizeOptionalString(this.config.pluginVersion)
    };
  }

  async runCommand(command, args = [], options = {}) {
    const timeoutMs = normalizeInteger(options.timeoutMs, this.config.updateCommandTimeoutMs || DEFAULT_UPDATE_COMMAND_TIMEOUT_MS);
    const spawnImpl = options.spawnImpl || this.config.spawnImpl || spawn;

    return new Promise((resolve, reject) => {
      let settled = false;
      let stdout = "";
      let stderr = "";
      const child = spawnImpl(command, args, {
        cwd: options.cwd || process.cwd(),
        env: options.env || process.env,
        shell: options.shell === true,
        windowsHide: process.platform === "win32"
      });

      const finish = (callback) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        callback();
      };

      if (child.stdout && typeof child.stdout.on === "function") {
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString("utf8");
        });
      }
      if (child.stderr && typeof child.stderr.on === "function") {
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString("utf8");
        });
      }

      child.on("error", (error) => {
        finish(() => reject(error));
      });
      child.on("close", (exitCode, signal) => {
        finish(() =>
          resolve({
            command,
            args,
            exitCode: Number.isInteger(exitCode) ? exitCode : 1,
            signal,
            stdout: normalizeOptionalString(stdout),
            stderr: normalizeOptionalString(stderr)
          })
        );
      });

      const timeout = setTimeout(() => {
        if (typeof child.kill === "function") {
          child.kill("SIGTERM");
        }
        finish(() => reject(new Error(`Timed out while running ${command} ${args.join(" ")}`.trim())));
      }, timeoutMs);
    });
  }

  async runOpenClawCommand(args = [], options = {}) {
    return this.runCommand(this.config.openclawCommand || "openclaw", args, {
      ...options,
      shell: process.platform === "win32"
    });
  }

  async startQuickstart(options = {}) {
    if (!this.config.quickstartCommand) {
      throw new Error(
        "TraeClaw is not ready and no quickstartCommand is configured. Start TraeClaw first or configure plugins.entries.traeclaw.config.quickstartCommand."
      );
    }

    const env = {
      ...process.env
    };
    for (const [key, value] of Object.entries(options.envOverrides || {})) {
      if (value === undefined || value === null || value === "") {
        delete env[key];
        continue;
      }
      env[key] = String(value);
    }

    const child = spawn(this.config.quickstartCommand, {
      cwd: this.config.quickstartCwd || process.cwd(),
      detached: true,
      stdio: "ignore",
      shell: true,
      windowsHide: process.platform === "win32",
      env
    });
    child.unref();
  }

  async getHealth() {
    return this.request("/health", {
      timeoutMs: 5000
    });
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

  async fetchLatestPublishedVersion(options = {}) {
    return fetchLatestPublishedVersion({
      packageName: options.packageName || this.config.packageName,
      timeoutMs: options.timeoutMs || this.config.updateCheckTimeoutMs,
      fetchImpl: options.fetchImpl || this.config.fetchImpl
    });
  }

  async getPluginUpdateInfo({ forceRefresh = false } = {}) {
    const installed = this.getInstalledPluginMetadata();
    const packageName = installed.packageName;
    const currentVersion = installed.version;
    const runtimeSnapshot = snapshotPluginRuntimeState(this.config);
    if (!this.config.checkForUpdates) {
      return {
        packageName,
        currentVersion,
        latestVersion: "",
        updateAvailable: false,
        disabled: true,
        errorMessage: "",
        ...runtimeSnapshot
      };
    }

    const cacheKey = `${packageName}@${currentVersion}`;
    const cachedEntry = pluginUpdateCache.get(cacheKey);
    const nowMs = Date.now();
    if (cachedEntry && forceRefresh !== true && cachedEntry.expiresAtMs > nowMs) {
      return {
        ...cachedEntry.value,
        ...runtimeSnapshot
      };
    }

    try {
      const latest = await this.fetchLatestPublishedVersion({
        packageName,
        timeoutMs: this.config.updateCheckTimeoutMs
      });
      const updateInfo = {
        packageName,
        currentVersion,
        latestVersion: latest.latestVersion,
        updateAvailable: currentVersion ? compareSemanticVersions(latest.latestVersion, currentVersion) > 0 : false,
        disabled: false,
        errorMessage: ""
      };
      pluginUpdateCache.set(cacheKey, {
        value: updateInfo,
        expiresAtMs: nowMs + UPDATE_CHECK_SUCCESS_TTL_MS
      });
      return {
        ...updateInfo,
        ...runtimeSnapshot
      };
    } catch (error) {
      const updateInfo = {
        packageName,
        currentVersion,
        latestVersion: "",
        updateAvailable: false,
        disabled: false,
        errorMessage: error.message || "Update check failed"
      };
      pluginUpdateCache.set(cacheKey, {
        value: updateInfo,
        expiresAtMs: nowMs + UPDATE_CHECK_FAILURE_TTL_MS
      });
      return {
        ...updateInfo,
        ...runtimeSnapshot
      };
    }
  }

  async updateSelf({ force = false, source = "manual" } = {}) {
    const installedBefore = this.getInstalledPluginMetadata();
    const startedAt = new Date().toISOString();
    updatePluginRuntimeState(this.config, {
      lastUpdateCheckAt: startedAt,
      lastUpdateAttemptAt: startedAt,
      lastUpdateStatus: "checking",
      lastUpdateMessage: "Checking for plugin updates.",
      lastUpdateSource: source,
      autoApplyEnabled: this.config.autoApplyUpdates === true,
      lastKnownCurrentVersion: installedBefore.version
    });
    let latestVersion = "";

    try {
      latestVersion = (await this.fetchLatestPublishedVersion({
        packageName: installedBefore.packageName,
        timeoutMs: this.config.updateCheckTimeoutMs
      })).latestVersion;
    } catch {}

    if (
      force !== true &&
      latestVersion &&
      installedBefore.version &&
      compareSemanticVersions(latestVersion, installedBefore.version) <= 0
    ) {
      const result = {
        pluginId: PLUGIN_ID,
        packageName: installedBefore.packageName,
        previousVersion: installedBefore.version,
        installedVersion: installedBefore.version,
        latestVersion,
        changed: false,
        alreadyLatest: true,
        restartRequired: false,
        warningMessage: "",
        commandOutputSummary: ""
      };
      updatePluginRuntimeState(this.config, {
        pendingRestart: false,
        lastUpdateStatus: "up_to_date",
        lastUpdateMessage: "Plugin is already at the latest published version.",
        lastKnownCurrentVersion: result.installedVersion,
        lastKnownLatestVersion: latestVersion
      });
      return result;
    }

    try {
      const commandResult = await this.runOpenClawCommand(["plugins", "update", PLUGIN_ID], {
        timeoutMs: this.config.updateCommandTimeoutMs
      });
      const commandOutputSummary = summarizeCommandOutput(commandResult.stdout, commandResult.stderr);
      if (commandResult.exitCode !== 0) {
        throw new Error(
          commandOutputSummary
            ? `openclaw plugins update ${PLUGIN_ID} failed.\n${commandOutputSummary}`
            : `openclaw plugins update ${PLUGIN_ID} failed with exit code ${commandResult.exitCode}`
        );
      }

      pluginUpdateCache.clear();
      const installedAfter = this.getInstalledPluginMetadata();
      if (!latestVersion) {
        try {
          latestVersion = (await this.fetchLatestPublishedVersion({
            packageName: installedAfter.packageName,
            timeoutMs: this.config.updateCheckTimeoutMs
          })).latestVersion;
        } catch {}
      }

      const changed =
        Boolean(installedAfter.version && installedBefore.version && installedAfter.version !== installedBefore.version) ||
        Boolean(installedAfter.version && !installedBefore.version);
      const alreadyLatest =
        Boolean(latestVersion && installedAfter.version) && compareSemanticVersions(latestVersion, installedAfter.version) <= 0;
      const warningMessage =
        !changed && latestVersion && installedBefore.version && compareSemanticVersions(latestVersion, installedBefore.version) > 0
          ? "Installed version did not change. This plugin may be linked from a local path and may need a manual reinstall."
          : "";

      const result = {
        pluginId: PLUGIN_ID,
        packageName: installedAfter.packageName || installedBefore.packageName,
        previousVersion: installedBefore.version,
        installedVersion: installedAfter.version || installedBefore.version,
        latestVersion,
        changed,
        alreadyLatest,
        restartRequired: changed,
        warningMessage,
        commandOutputSummary
      };
      updatePluginRuntimeState(this.config, {
        pendingRestart: changed === true,
        lastUpdateStatus: changed ? "updated" : alreadyLatest ? "up_to_date" : "unchanged",
        lastUpdateMessage:
          warningMessage || (changed ? "Plugin updated successfully. Restart OpenClaw Gateway to load the new version." : "Plugin update finished."),
        lastKnownCurrentVersion: result.installedVersion,
        lastKnownLatestVersion: latestVersion
      });
      return result;
    } catch (error) {
      updatePluginRuntimeState(this.config, {
        lastUpdateStatus: "failed",
        lastUpdateMessage: error.message || "Plugin update failed",
        lastKnownLatestVersion: latestVersion
      });
      throw error;
    }
  }

  async getStatus({ allowAutoStart = false } = {}) {
    const [readiness, updateInfo] = await Promise.all([
      this.ensureReady({ allowAutoStart }),
      this.getPluginUpdateInfo()
    ]);
    const healthResponse = await this.getHealth().catch(() => null);

    return {
      baseUrl: this.config.baseUrl,
      gatewayReachable: Boolean(healthResponse?.ok),
      ready: readiness.ready,
      autoStarted: readiness.autoStarted,
      updateInfo,
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

  async waitForProject(expectedProjectName, previousTitle = "", deadlineMs = this.config.readyTimeoutMs) {
    const startedAt = Date.now();
    const normalizedPreviousTitle = String(previousTitle || "").trim();
    let lastHealth = null;

    while (Date.now() - startedAt < deadlineMs) {
      lastHealth = await this.getHealth().catch((error) => ({
        ok: false,
        status: 0,
        json: null,
        text: "",
        error
      }));

      const currentTitle = extractHealthWindowTitle(lastHealth);
      const ready = Boolean(lastHealth?.ok && lastHealth?.json?.data?.automation?.ready === true);
      const titleMatchesProject = matchesProjectWindowTitle(currentTitle, expectedProjectName);
      const titleChanged = Boolean(currentTitle && normalizedPreviousTitle && currentTitle !== normalizedPreviousTitle);
      const titleInitialized = Boolean(currentTitle && !normalizedPreviousTitle);
      if (ready && (titleMatchesProject || titleChanged || titleInitialized)) {
        return lastHealth;
      }

      await sleep(1000);
    }

    return lastHealth;
  }

  async createSession({ metadata = {}, prepare = false, allowAutoStart = false } = {}) {
    if (prepare) {
      const readiness = await this.ensureReady({ allowAutoStart });
      if (!readiness.ready) {
        const errorMessage =
          readiness.readyResponse?.json?.message ||
          readiness.readyResponse?.json?.details?.message ||
          readiness.readyResponse?.error?.message ||
          `TraeClaw at ${this.config.baseUrl} is not ready`;
        throw new Error(errorMessage);
      }
    }

    const response = await this.request("/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        metadata,
        prepare
      }
    });

    if (!response.ok || !response.json?.success) {
      throw new Error(response.json?.message || `TraeClaw request failed with status ${response.status}`);
    }

    return response.json;
  }

  async createNewChat({ allowAutoStart = true } = {}) {
    return this.createSession({
      metadata: {
        client: "openclaw-trae-plugin",
        action: "trae_new_chat"
      },
      prepare: true,
      allowAutoStart
    });
  }

  async openProject({ projectPath } = {}) {
    const normalizedProjectPath = String(projectPath || "").trim();
    if (!normalizedProjectPath) {
      throw new Error("trae_open_project requires a non-empty projectPath");
    }

    const resolvedProjectPath = path.resolve(normalizedProjectPath);
    if (!fs.existsSync(resolvedProjectPath)) {
      throw new Error(`Project path does not exist: ${resolvedProjectPath}`);
    }
    if (!fs.statSync(resolvedProjectPath).isDirectory()) {
      throw new Error(`Project path must be a directory: ${resolvedProjectPath}`);
    }

    const projectName = path.basename(resolvedProjectPath);
    const currentHealth = await this.getHealth().catch(() => null);
    const previousTitle = extractHealthWindowTitle(currentHealth);
    const alreadyReady = Boolean(currentHealth?.ok && currentHealth?.json?.data?.automation?.ready === true);
    if (alreadyReady && matchesProjectWindowTitle(previousTitle, projectName)) {
      return {
        projectPath: resolvedProjectPath,
        projectName,
        baseUrl: this.config.baseUrl,
        ready: true,
        autoStarted: false,
        alreadyOpen: true,
        windowTitle: previousTitle
      };
    }

    await this.startQuickstart({
      envOverrides: {
        TRAE_QUICKSTART_PROJECT_PATH: resolvedProjectPath,
        TRAE_QUICKSTART_FORCE_FRESH_WINDOW: "1"
      }
    });

    const waitedHealth = await this.waitForProject(projectName, previousTitle, this.config.readyTimeoutMs);
    const windowTitle = extractHealthWindowTitle(waitedHealth);
    const ready = Boolean(waitedHealth?.ok && waitedHealth?.json?.data?.automation?.ready === true);
    const projectDetected =
      matchesProjectWindowTitle(windowTitle, projectName) ||
      Boolean(windowTitle && previousTitle && windowTitle !== previousTitle) ||
      Boolean(windowTitle && !previousTitle);

    if (!ready || !projectDetected) {
      throw new Error(
        readResponseErrorMessage(
          waitedHealth,
          `TraeClaw at ${this.config.baseUrl} did not switch to project ${projectName} in time`
        )
      );
    }

    return {
      projectPath: resolvedProjectPath,
      projectName,
      baseUrl: this.config.baseUrl,
      ready: true,
      autoStarted: true,
      alreadyOpen: false,
      windowTitle
    };
  }

  async switchMode({ mode, allowAutoStart = true } = {}) {
    const normalizedMode = String(mode || "").trim().toLowerCase();
    if (normalizedMode !== "solo" && normalizedMode !== "ide") {
      throw new Error('trae_switch_mode requires mode to be either "solo" or "ide"');
    }

    const performRequest = () =>
      this.request("/v1/mode", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: {
          mode: normalizedMode
        }
      });

    const shouldAttemptAutoStart = allowAutoStart && this.config.autoStart;
    let autoStarted = false;
    let response = null;

    try {
      response = await performRequest();
    } catch (error) {
      if (!shouldAttemptAutoStart) {
        throw error;
      }

      const readiness = await this.ensureReady({ allowAutoStart: true });
      if (!readiness.ready) {
        throw new Error(
          readResponseErrorMessage(readiness.readyResponse, `TraeClaw at ${this.config.baseUrl} is not ready`)
        );
      }
      autoStarted = readiness.autoStarted;
      response = await performRequest();
    }

    if ((!response.ok || !response.json?.success) && shouldAttemptAutoStart && response.status === 503) {
      const readiness = await this.ensureReady({ allowAutoStart: true });
      if (!readiness.ready) {
        throw new Error(
          readResponseErrorMessage(readiness.readyResponse, `TraeClaw at ${this.config.baseUrl} is not ready`)
        );
      }
      autoStarted = readiness.autoStarted;
      response = await performRequest();
    }

    if (!response.ok || !response.json?.success) {
      throw new Error(response.json?.message || `TraeClaw request failed with status ${response.status}`);
    }

    return {
      ...response.json,
      autoStarted
    };
  }

  async delegateTask({ task, sessionId, allowAutoStart = true, projectPath } = {}) {
    if (typeof task !== "string" || !task.trim()) {
      throw new Error("trae_delegate requires a non-empty task string");
    }

    if (typeof projectPath === "string" && projectPath.trim()) {
      await this.openProject({
        projectPath
      });
    }

    const readiness = await this.ensureReady({ allowAutoStart });
    if (!readiness.ready) {
      const errorMessage =
        readiness.readyResponse?.json?.message ||
        readiness.readyResponse?.json?.details?.message ||
        readiness.readyResponse?.error?.message ||
        `TraeClaw at ${this.config.baseUrl} is not ready`;
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
      throw new Error(response.json?.message || `TraeClaw request failed with status ${response.status}`);
    }

    return response.json;
  }
}

function createTraeApiClient(config) {
  return new TraeApiClient(config);
}

async function runAutoUpdateCycle(config, options = {}) {
  const runtimeState = updatePluginRuntimeState(config, {
    autoApplyEnabled: config.autoApplyUpdates === true
  });
  if (config.autoApplyUpdates !== true) {
    return {
      ok: false,
      skipped: true,
      reason: "disabled"
    };
  }
  if (runtimeState.pendingRestart) {
    updatePluginRuntimeState(config, {
      lastUpdateStatus: "pending_restart",
      lastUpdateMessage: "A newer plugin version is already installed. Restart OpenClaw Gateway to load it."
    });
    return {
      ok: false,
      skipped: true,
      reason: "pending_restart"
    };
  }
  if (runtimeState.autoUpdateInFlight) {
    return runtimeState.autoUpdateInFlight;
  }

  const createClient = options.createClient || createTraeApiClient;
  const startedAt = new Date().toISOString();
  updatePluginRuntimeState(config, {
    lastUpdateCheckAt: startedAt,
    lastUpdateStatus: "checking",
    lastUpdateMessage: "Checking for plugin updates in the background."
  });

  const inFlightPromise = (async () => {
    try {
      const client = createClient(config);
      const result = await client.updateSelf({
        force: false,
        source: "auto"
      });
      updatePluginRuntimeState(config, {
        pendingRestart: result.restartRequired === true || result.changed === true,
        lastUpdateStatus: result.changed ? "updated" : result.alreadyLatest ? "up_to_date" : "unchanged",
        lastUpdateMessage:
          result.warningMessage ||
          (result.changed
            ? "Plugin updated successfully in the background. Restart OpenClaw Gateway to load the new version."
            : "Plugin is already at the latest published version."),
        lastUpdateSource: "auto",
        lastKnownCurrentVersion: result.installedVersion,
        lastKnownLatestVersion: result.latestVersion
      });
      return {
        ok: true,
        result
      };
    } catch (error) {
      updatePluginRuntimeState(config, {
        lastUpdateStatus: "failed",
        lastUpdateMessage: error.message || "Background plugin update failed"
      });
      return {
        ok: false,
        errorMessage: error.message || "Background plugin update failed"
      };
    } finally {
      updatePluginRuntimeState(config, {
        autoUpdateInFlight: null
      });
    }
  })();

  updatePluginRuntimeState(config, {
    autoUpdateInFlight: inFlightPromise
  });
  return inFlightPromise;
}

function schedulePluginAutoUpdate(config, options = {}) {
  const runtimeState = updatePluginRuntimeState(config, {
    autoApplyEnabled: config.autoApplyUpdates === true
  });
  if (config.autoApplyUpdates !== true) {
    return runtimeState;
  }
  if (runtimeState.autoUpdateScheduled) {
    return runtimeState;
  }

  const setTimeoutImpl = options.setTimeoutImpl || setTimeout;
  const createClient = options.createClient;
  const scheduleNext = (delayMs) => {
    const timer = setTimeoutImpl(async () => {
      updatePluginRuntimeState(config, {
        autoUpdateTimer: null
      });
      await runAutoUpdateCycle(config, {
        createClient
      });
      const latestState = getPluginRuntimeState(config);
      if (config.autoUpdateIntervalMs > 0 && latestState.pendingRestart !== true) {
        scheduleNext(config.autoUpdateIntervalMs);
      }
    }, normalizeNonNegativeInteger(delayMs, 0));
    if (timer && typeof timer.unref === "function") {
      timer.unref();
    }
    updatePluginRuntimeState(config, {
      autoUpdateTimer: timer
    });
  };

  updatePluginRuntimeState(config, {
    autoUpdateScheduled: true
  });
  scheduleNext(config.autoUpdateStartDelayMs);
  return runtimeState;
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_READY_TIMEOUT_MS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_UPDATE_CHECK_TIMEOUT_MS,
  DEFAULT_UPDATE_COMMAND_TIMEOUT_MS,
  DEFAULT_AUTO_UPDATE_START_DELAY_MS,
  DEFAULT_AUTO_UPDATE_INTERVAL_MS,
  PLUGIN_ID,
  TraeApiClient,
  compareSemanticVersions,
  createTraeApiClient,
  fetchLatestPublishedVersion,
  formatDelegateToolResult,
  formatNewChatToolResult,
  formatOpenProjectToolResult,
  formatStatusToolResult,
  formatSwitchModeToolResult,
  formatUpdateToolResult,
  getBundledQuickstartDefaults,
  readInstalledPluginPackageMetadata,
  runAutoUpdateCycle,
  resolveReplyText,
  resolveBundledRuntimeRoot,
  resolvePluginRuntimeConfig,
  schedulePluginAutoUpdate,
  stripDuplicateFinalText
};
