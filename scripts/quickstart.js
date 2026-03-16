const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");
const { createTraeAutomationDriver } = require("../src/cdp/dom-driver");
const { buildQuickstartRuntimePlan } = require("../src/config/quickstart");
const { loadEnvFiles, readEnvFile, updateEnvFile } = require("../src/config/env");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const ENV_EXAMPLE_PATH = path.join(ROOT_DIR, ".env.example");
const DEFAULT_PROJECT_PATH = path.join(ROOT_DIR, ".runtime", "trae-project");
const DEFAULT_PROJECT_README = `# TraeAPI Workspace

This folder was created by the TraeAPI quickstart launcher.
`;
const DEFAULT_HEALTH_TIMEOUT_MS = 15000;
const DEFAULT_AUTOMATION_READY_TIMEOUT_MS = 20000;
const DEFAULT_TRAE_START_TIMEOUT_MS = 30000;

function pathExists(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath);
}

function isTrueLike(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
}

function normalizePathInput(value) {
  const normalized = String(value || "").trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return false;
  }
  fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  return true;
}

function buildTraeCandidates() {
  const candidates = [
    process.env.TRAE_BIN,
    "D:\\trae\\Trae\\Trae.exe",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "Trae", "Trae.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Trae", "Trae.exe") : "",
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Trae", "Trae.exe") : "",
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Trae", "Trae.exe") : "",
    process.env.ProgramW6432 ? path.join(process.env.ProgramW6432, "Trae", "Trae.exe") : ""
  ];
  return [...new Set(candidates.map((item) => String(item || "").trim()).filter(Boolean))];
}

function detectTraeBinary() {
  return buildTraeCandidates().find((candidate) => pathExists(candidate)) || "";
}

function ensureProjectDirectory(projectPath) {
  fs.mkdirSync(projectPath, { recursive: true });
  const readmePath = path.join(projectPath, "README.md");
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, DEFAULT_PROJECT_README, "utf8");
  }
}

async function promptForExistingPath(rl, label, defaultValue = "") {
  while (true) {
    const answer =
      normalizePathInput(await rl.question(`${label}${defaultValue ? ` [${defaultValue}]` : ""}: `)) || defaultValue;
    if (pathExists(answer)) {
      return path.resolve(answer);
    }
    console.log(`Path not found: ${answer}`);
  }
}

async function ensureConfig() {
  const createdEnvFile = ensureEnvFile();
  loadEnvFiles({ cwd: ROOT_DIR });

  const envFile = readEnvFile(ENV_PATH);
  const currentValues = envFile.values;
  const updates = {};
  const summary = {
    createdEnvFile
  };
  const configuredProjectPath = String(currentValues.TRAE_PROJECT_PATH || process.env.TRAE_PROJECT_PATH || "").trim();

  let traeBin = String(currentValues.TRAE_BIN || process.env.TRAE_BIN || "").trim();
  if (!pathExists(traeBin)) {
    traeBin = detectTraeBinary();
    if (traeBin) {
      updates.TRAE_BIN = traeBin;
      console.log(`Detected Trae executable: ${traeBin}`);
    }
  }

  let projectPath = configuredProjectPath;
  if (!projectPath) {
    projectPath = DEFAULT_PROJECT_PATH;
    updates.TRAE_PROJECT_PATH = projectPath;
  }

  const rl = readline.createInterface({ input, output });
  try {
    if (!traeBin) {
      traeBin = await promptForExistingPath(rl, "Enter the full path to Trae.exe");
      updates.TRAE_BIN = traeBin;
    }

    if (projectPath && configuredProjectPath && !pathExists(projectPath)) {
      const requestedProjectPath = normalizePathInput(await rl.question(`Project path to open in Trae [${projectPath}]: `));
      if (requestedProjectPath) {
        projectPath = path.resolve(requestedProjectPath);
        updates.TRAE_PROJECT_PATH = projectPath;
      }
    }
  } finally {
    rl.close();
  }

  ensureProjectDirectory(projectPath);
  updates.TRAE_PROJECT_PATH = projectPath;

  if (Object.keys(updates).length > 0) {
    updateEnvFile(ENV_PATH, updates);
    loadEnvFiles({ cwd: ROOT_DIR });
  }

  summary.traeBin = traeBin;
  summary.projectPath = projectPath;
  summary.port = Number(process.env.PORT || 8787);
  summary.host = String(process.env.HOST || "127.0.0.1").trim() || "127.0.0.1";
  summary.remoteDebuggingPort = Number(process.env.TRAE_REMOTE_DEBUGGING_PORT || 9222);
  summary.traeArgs = String(process.env.TRAE_ARGS || "").trim();
  summary.traeStartTimeoutMs = Number(process.env.TRAE_CDP_START_TIMEOUT_MS || DEFAULT_TRAE_START_TIMEOUT_MS);
  summary.quickstartUseIsolatedProfile = String(process.env.TRAE_QUICKSTART_USE_ISOLATED_PROFILE || "1").trim() !== "0";
  summary.quickstartRemoteDebuggingPort = Number(process.env.TRAE_QUICKSTART_REMOTE_DEBUGGING_PORT || 9333);
  summary.quickstartUserDataDir = String(
    process.env.TRAE_QUICKSTART_USER_DATA_DIR || path.join(ROOT_DIR, ".runtime", "trae-quickstart-profile")
  ).trim();
  summary.quickstartOpenChat = isTrueLike(process.env.TRAE_QUICKSTART_OPEN_CHAT, true);
  return summary;
}

function requestGatewayEndpoint(host, port, pathname) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: host,
        port,
        path: pathname,
        timeout: 1000
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body
          });
        });
      }
    );

    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });
}

async function checkGatewayHealth(host, port) {
  const response = await requestGatewayEndpoint(host, port, "/health");
  return response?.statusCode === 200;
}

async function checkGatewayReady(host, port) {
  const response = await requestGatewayEndpoint(host, port, "/ready");
  return response?.statusCode === 200;
}

async function waitForGatewayEndpoint(host, port, pathname, childProcess = null) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < DEFAULT_HEALTH_TIMEOUT_MS) {
    const response = await requestGatewayEndpoint(host, port, pathname);
    if (response?.statusCode === 200) {
      return true;
    }
    if (childProcess && childProcess.exitCode !== null) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function openUrl(url) {
  let child = null;
  if (process.platform === "win32") {
    child = spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
  } else if (process.platform === "darwin") {
    child = spawn("open", [url], {
      detached: true,
      stdio: "ignore"
    });
  } else {
    child = spawn("xdg-open", [url], {
      detached: true,
      stdio: "ignore"
    });
  }

  child.unref();
}

function openChatPage(config) {
  const chatUrl = `http://${config.host}:${config.port}/chat`;
  if (!config.quickstartOpenChat) {
    return;
  }

  try {
    openUrl(chatUrl);
  } catch (error) {
    console.warn(
      JSON.stringify(
        {
          code: "QUICKSTART_OPEN_CHAT_SKIPPED",
          message: "TraeAPI is ready, but the browser could not be opened automatically.",
          chatUrl,
          details: {
            message: error.message
          }
        },
        null,
        2
      )
    );
  }
}

function runNodeScript(scriptFileName, { waitForExit = true, envOverrides = {} } = {}) {
  const child = spawn(process.execPath, [path.join(__dirname, scriptFileName)], {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides
    }
  });

  if (!waitForExit) {
    return child;
  }

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(child);
        return;
      }
      reject(
        new Error(
          `${scriptFileName} exited with ${signal ? `signal ${signal}` : `code ${code}`}`
        )
      );
    });
  });
}

async function withTemporaryEnv(overrides, callback) {
  const keys = Object.keys(overrides || {});
  const previous = new Map();
  for (const key of keys) {
    previous.set(key, process.env[key]);
    if (overrides[key] === undefined || overrides[key] === null || overrides[key] === "") {
      delete process.env[key];
    } else {
      process.env[key] = String(overrides[key]);
    }
  }

  try {
    return await callback();
  } finally {
    for (const key of keys) {
      const priorValue = previous.get(key);
      if (priorValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = priorValue;
      }
    }
  }
}

async function waitForAutomationReady(timeoutMs, childProcess = null) {
  const startedAt = Date.now();
  let lastReadiness = null;
  while (Date.now() - startedAt < timeoutMs) {
    const driver = createTraeAutomationDriver();
    try {
      lastReadiness = await driver.getReadiness();
      if (lastReadiness.ready) {
        return lastReadiness;
      }
    } catch (error) {
      lastReadiness = {
        ready: false,
        error: {
          code: error.code || "AUTOMATION_NOT_READY",
          message: error.message,
          details: error.details || {}
        }
      };
    }

    if (childProcess && childProcess.exitCode !== null) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastReadiness;
}

async function getAutomationReadinessForRuntime(runtime, timeoutMs, childProcess = null) {
  return withTemporaryEnv(runtime.env, async () => waitForAutomationReady(timeoutMs, childProcess));
}

async function tryLaunchTrae(runtime) {
  try {
    await runNodeScript("start-trae.js", {
      envOverrides: runtime.env
    });
    return {
      started: true,
      error: null
    };
  } catch (error) {
    console.warn(
      JSON.stringify(
        {
          code: "QUICKSTART_TRAE_LAUNCH_INCOMPLETE",
          message: "Trae launch returned before automation was ready. Quickstart will keep probing in the background.",
          mode: runtime.label,
          debuggerPort: runtime.debuggerPort,
          details: {
            message: error.message
          }
        },
        null,
        2
      )
    );
    return {
      started: false,
      error
    };
  }
}

async function attemptRuntime(runtime) {
  let readiness = await getAutomationReadinessForRuntime(runtime, 3000);
  if (readiness?.ready) {
    return {
      runtime,
      readiness
    };
  }

  await tryLaunchTrae(runtime);
  readiness = await getAutomationReadinessForRuntime(runtime, DEFAULT_AUTOMATION_READY_TIMEOUT_MS);
  return {
    runtime,
    readiness
  };
}

async function ensureTraeWindowReady(config) {
  const runtimePlan = buildQuickstartRuntimePlan({
    rootDir: ROOT_DIR,
    traeBin: config.traeBin,
    projectPath: config.projectPath,
    traeArgs: config.traeArgs,
    remoteDebuggingPort: config.remoteDebuggingPort,
    quickstartRemoteDebuggingPort: config.quickstartRemoteDebuggingPort,
    quickstartUserDataDir: config.quickstartUserDataDir,
    traeStartTimeoutMs: config.traeStartTimeoutMs
  });

  const configuredAttempt = await attemptRuntime(runtimePlan.configured);
  if (configuredAttempt.readiness?.ready) {
    return configuredAttempt;
  }

  if (!config.quickstartUseIsolatedProfile) {
    throw Object.assign(new Error(configuredAttempt.readiness?.error?.message || "Trae automation is not ready"), {
      code: configuredAttempt.readiness?.error?.code || "AUTOMATION_NOT_READY",
      details: configuredAttempt.readiness?.details || configuredAttempt.readiness?.error?.details || {}
    });
  }

  console.warn(
    JSON.stringify(
      {
        code: "QUICKSTART_SWITCHING_TO_ISOLATED_TRAE",
        message: "The default Trae window is not automation-ready. Quickstart will launch a dedicated Trae window automatically.",
        configuredPort: runtimePlan.configured.debuggerPort,
        isolatedPort: runtimePlan.isolated.debuggerPort,
        isolatedUserDataDir: runtimePlan.isolated.userDataDir,
        details:
          configuredAttempt.readiness?.details || configuredAttempt.readiness?.error?.details || {}
      },
      null,
      2
    )
  );

  fs.mkdirSync(runtimePlan.isolated.userDataDir, { recursive: true });
  const isolatedAttempt = await attemptRuntime(runtimePlan.isolated);
  if (isolatedAttempt.readiness?.ready) {
    return isolatedAttempt;
  }

  const configuredError = configuredAttempt.readiness?.error || {};
  const isolatedError = isolatedAttempt.readiness?.error || {};
  throw Object.assign(new Error(isolatedError.message || configuredError.message || "Trae automation is not ready"), {
    code: isolatedError.code || configuredError.code || "AUTOMATION_NOT_READY",
    details: {
      configured: configuredAttempt.readiness?.details || configuredError.details || {},
      isolated: isolatedAttempt.readiness?.details || isolatedError.details || {}
    }
  });
}

async function main() {
  const config = await ensureConfig();
  const existingGatewayHealth = await checkGatewayHealth(config.host, config.port);
  const existingGatewayReady = existingGatewayHealth ? await checkGatewayReady(config.host, config.port) : false;

  if (existingGatewayHealth && existingGatewayReady) {
    openChatPage(config);
    console.log(
      JSON.stringify(
        {
          message: "TraeAPI gateway is already running",
          host: config.host,
          port: config.port,
          chatUrl: `http://${config.host}:${config.port}/chat`,
          envFile: ENV_PATH,
          mode: "attached"
        },
        null,
        2
      )
    );
    return;
  }

  const launchResult = await ensureTraeWindowReady(config);

  if (existingGatewayHealth && !existingGatewayReady) {
    const revivedGatewayReady = await waitForGatewayEndpoint(config.host, config.port, "/ready");
    if (revivedGatewayReady) {
      openChatPage(config);
      console.log(
        JSON.stringify(
          {
            message: "TraeAPI gateway is already running and is now ready",
            host: config.host,
            port: config.port,
            chatUrl: `http://${config.host}:${config.port}/chat`,
            envFile: ENV_PATH,
            mode: launchResult.runtime.label
          },
          null,
          2
        )
      );
      return;
    }

    throw new Error(
      `A gateway is already running on http://${config.host}:${config.port}, but it did not become ready. Close the existing gateway or change PORT.`
    );
  }

  const gatewayChild = runNodeScript("start-gateway.js", {
    waitForExit: false,
    envOverrides: launchResult.runtime.env
  });
  const stopGateway = () => {
    if (gatewayChild.exitCode === null) {
      gatewayChild.kill();
    }
  };

  process.once("SIGINT", stopGateway);
  process.once("SIGTERM", stopGateway);

  const gatewayReady = await waitForGatewayEndpoint(config.host, config.port, "/ready", gatewayChild);
  if (!gatewayReady) {
    stopGateway();
    throw new Error(`Gateway did not become ready on http://${config.host}:${config.port} within the expected time`);
  }

  openChatPage(config);
  console.log(
    JSON.stringify(
      {
        message: "TraeAPI quickstart is ready",
        envFile: ENV_PATH,
        traeBin: config.traeBin,
        projectPath: config.projectPath,
        host: config.host,
        port: config.port,
        chatUrl: `http://${config.host}:${config.port}/chat`,
        mode: launchResult.runtime.label
      },
      null,
      2
    )
  );

  await new Promise((resolve, reject) => {
    gatewayChild.once("error", reject);
    gatewayChild.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`start-gateway.js exited with code ${code}`));
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify(
        {
          code: "TRAEAPI_QUICKSTART_FAILED",
          message: error.message,
          details: error.details || {}
        },
        null,
        2
      )
    );
    process.exit(1);
  });
}

module.exports = {
  main
};
