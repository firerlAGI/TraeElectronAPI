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
const DEFAULT_PROFILE_SEED_MARKER = ".traeapi-profile-seed.json";
const QUICKSTART_PROFILE_SEED_ENTRIES = [
  "Local State",
  "Preferences",
  "Network",
  "Local Storage",
  "Session Storage",
  "IndexedDB",
  "WebStorage",
  "SharedStorage",
  path.join("User", "globalStorage"),
  path.join("User", "settings.json"),
  path.join("Partitions", "trae-webview", "Network"),
  path.join("Partitions", "trae-webview", "Local Storage"),
  path.join("Partitions", "trae-webview", "Session Storage"),
  path.join("Partitions", "trae-webview", "IndexedDB"),
  path.join("Partitions", "trae-webview", "WebStorage"),
  path.join("Partitions", "trae-webview", "SharedStorage"),
  path.join("Partitions", "trae-webview", "Preferences"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "Network"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "Local Storage"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "Session Storage"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "IndexedDB"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "WebStorage"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "SharedStorage"),
  path.join("Partitions", "icube-web-crawler-shared-session-v1.0", "Preferences")
];

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

function resolveHomeDirectory(env = process.env) {
  return String(env.HOME || env.USERPROFILE || "").trim();
}

function getTraeBinaryPromptLabel(platform = process.platform) {
  return platform === "darwin"
    ? "Enter the full path to the Trae executable or .app bundle"
    : "Enter the full path to the Trae executable";
}

function resolveDefaultTraeUserDataDir(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    if (!env.APPDATA) {
      return "";
    }
    return path.join(env.APPDATA, "Trae");
  }

  const homeDir = resolveHomeDirectory(env);
  if (platform === "darwin") {
    return homeDir ? path.join(homeDir, "Library", "Application Support", "Trae") : "";
  }

  if (platform === "linux") {
    if (env.XDG_CONFIG_HOME) {
      return path.join(env.XDG_CONFIG_HOME, "Trae");
    }
    return homeDir ? path.join(homeDir, ".config", "Trae") : "";
  }

  return "";
}

function removePathIfExists(targetPath) {
  if (!pathExists(targetPath)) {
    return;
  }
  fs.rmSync(targetPath, {
    recursive: true,
    force: true
  });
}

function copyPathRecursive(sourcePath, targetPath, summary) {
  const stats = fs.lstatSync(sourcePath);
  if (stats.isDirectory()) {
    fs.mkdirSync(targetPath, { recursive: true });
    for (const entryName of fs.readdirSync(sourcePath)) {
      copyPathRecursive(path.join(sourcePath, entryName), path.join(targetPath, entryName), summary);
    }
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  summary.filesCopied += 1;
}

function seedIsolatedProfileFromExistingTrae(config, runtime) {
  if (!config.quickstartProfileSeed || !runtime?.userDataDir) {
    return null;
  }

  const requestedSourceDir = normalizePathInput(
    config.quickstartProfileSeedSourceDir || process.env.TRAE_QUICKSTART_PROFILE_SEED_SOURCE_DIR || resolveDefaultTraeUserDataDir()
  );
  if (!requestedSourceDir || !pathExists(requestedSourceDir)) {
    return null;
  }

  const sourceDir = path.resolve(requestedSourceDir);
  const targetDir = path.resolve(runtime.userDataDir);
  if (sourceDir === targetDir) {
    return null;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const summary = {
    sourceDir,
    targetDir,
    filesCopied: 0,
    entriesCopied: [],
    skippedEntries: []
  };

  for (const relativeEntry of QUICKSTART_PROFILE_SEED_ENTRIES) {
    const sourceEntry = path.join(sourceDir, relativeEntry);
    if (!pathExists(sourceEntry)) {
      summary.skippedEntries.push(relativeEntry);
      continue;
    }

    const targetEntry = path.join(targetDir, relativeEntry);
    removePathIfExists(targetEntry);

    try {
      copyPathRecursive(sourceEntry, targetEntry, summary);
      summary.entriesCopied.push(relativeEntry);
    } catch (error) {
      summary.skippedEntries.push(relativeEntry);
      console.warn(
        JSON.stringify(
          {
            code: "QUICKSTART_PROFILE_SEED_ENTRY_FAILED",
            message: "A Trae profile entry could not be copied into the isolated quickstart profile.",
            entry: relativeEntry,
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

  const markerPath = path.join(targetDir, DEFAULT_PROFILE_SEED_MARKER);
  fs.writeFileSync(
    markerPath,
    JSON.stringify(
      {
        sourceDir,
        targetDir,
        filesCopied: summary.filesCopied,
        entriesCopied: summary.entriesCopied,
        skippedEntries: summary.skippedEntries,
        seededAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(
    JSON.stringify(
      {
        code: "QUICKSTART_PROFILE_SEEDED",
        message: "Seeded the isolated Trae profile from the existing local Trae profile.",
        sourceDir,
        targetDir,
        filesCopied: summary.filesCopied,
        entriesCopied: summary.entriesCopied.length,
        skippedEntries: summary.skippedEntries.length
      },
      null,
      2
    )
  );

  return summary;
}

function ensureEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    return false;
  }
  fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
  return true;
}

function buildTraeCandidates(platform = process.platform, env = process.env) {
  const candidates = [env.TRAE_BIN];
  const homeDir = resolveHomeDirectory(env);

  if (platform === "win32") {
    candidates.push(
      "D:\\trae\\Trae\\Trae.exe",
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "Trae", "Trae.exe") : "",
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Trae", "Trae.exe") : "",
      env.ProgramFiles ? path.join(env.ProgramFiles, "Trae", "Trae.exe") : "",
      env["ProgramFiles(x86)"] ? path.join(env["ProgramFiles(x86)"], "Trae", "Trae.exe") : "",
      env.ProgramW6432 ? path.join(env.ProgramW6432, "Trae", "Trae.exe") : ""
    );
  }

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Trae.app/Contents/MacOS/Trae",
      "/Applications/Trae.app",
      homeDir ? path.join(homeDir, "Applications", "Trae.app", "Contents", "MacOS", "Trae") : "",
      homeDir ? path.join(homeDir, "Applications", "Trae.app") : ""
    );
  }

  if (platform === "linux") {
    candidates.push("/opt/Trae/trae", "/usr/bin/trae", "/usr/local/bin/trae");
  }

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
      traeBin = await promptForExistingPath(rl, getTraeBinaryPromptLabel());
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
  summary.quickstartProfileSeed = isTrueLike(process.env.TRAE_QUICKSTART_PROFILE_SEED, true);
  summary.quickstartProfileSeedSourceDir = String(
    process.env.TRAE_QUICKSTART_PROFILE_SEED_SOURCE_DIR || resolveDefaultTraeUserDataDir()
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

function buildGatewayUrls(config) {
  const baseUrl = `http://${config.host}:${config.port}`;
  return {
    baseUrl,
    chatUrl: `${baseUrl}/chat`,
    healthUrl: `${baseUrl}/health`,
    readyUrl: `${baseUrl}/ready`
  };
}

function printUserSummary(title, lines) {
  const normalizedLines = (lines || []).filter(Boolean);
  if (!normalizedLines.length) {
    return;
  }

  console.log("");
  console.log(title);
  for (const line of normalizedLines) {
    console.log(`- ${line}`);
  }
  console.log("");
}

function printGatewayReadySummary(config, mode, message) {
  const urls = buildGatewayUrls(config);
  printUserSummary(message, [
    `Mode: ${mode}`,
    `Chat: ${urls.chatUrl}`,
    `API: ${urls.baseUrl}`,
    `Health: ${urls.healthUrl}`,
    `Ready: ${urls.readyUrl}`,
    `Project: ${config.projectPath}`,
    `Env: ${ENV_PATH}`
  ]);
}

function printIsolatedWindowNotice(runtimePlan) {
  printUserSummary("TraeAPI quickstart is switching to a dedicated Trae window.", [
    "Your current Trae window is not automation-ready.",
    `Dedicated debug port: ${runtimePlan.isolated.debuggerPort}`,
    `Dedicated profile: ${runtimePlan.isolated.userDataDir}`
  ]);
}

function printQuickstartFailureHints(error) {
  printUserSummary("TraeAPI quickstart failed.", [
    error?.message || "Unknown startup error.",
    "Check that Trae is installed and you can sign in.",
    "Check that Trae can open a project window.",
    "If the window is open but automation still fails, run: npm run inspect:trae"
  ]);
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
  printIsolatedWindowNotice(runtimePlan);

  fs.mkdirSync(runtimePlan.isolated.userDataDir, { recursive: true });
  seedIsolatedProfileFromExistingTrae(config, runtimePlan.isolated);
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
    printGatewayReadySummary(config, "attached", "TraeAPI is already running.");
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
      printGatewayReadySummary(config, launchResult.runtime.label, "TraeAPI is already running and is now ready.");
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
  printGatewayReadySummary(config, launchResult.runtime.label, "TraeAPI quickstart is ready.");
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
    printQuickstartFailureHints(error);
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
  buildTraeCandidates,
  detectTraeBinary,
  getTraeBinaryPromptLabel,
  main,
  resolveDefaultTraeUserDataDir
};
