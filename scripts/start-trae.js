const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { discoverTraeTarget, getDebuggerVersion } = require("../src/cdp/discovery");
const { loadEnvFiles } = require("../src/config/env");

loadEnvFiles();

const START_TIMEOUT_MS = Number(process.env.TRAE_CDP_START_TIMEOUT_MS || 15000);
const REMOTE_DEBUGGING_PORT = Number(process.env.TRAE_REMOTE_DEBUGGING_PORT || 9222);
const WAIT_FOR_TARGET = String(process.env.TRAE_WAIT_FOR_TARGET || "1").trim() !== "0";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseLaunchArgs(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasRemoteDebuggingPortArg(args) {
  return args.some((arg) => /^--remote-debugging-port=/.test(arg));
}

function resolveProjectArg() {
  const projectPath = String(process.env.TRAE_PROJECT_PATH || "").trim();
  if (!projectPath) {
    return null;
  }
  if (!fs.existsSync(projectPath)) {
    throw new Error(`TRAE_PROJECT_PATH does not exist: ${projectPath}`);
  }
  return projectPath;
}

function resolveMacAppBundleExecutable(command) {
  const normalized = String(command || "").trim();
  if (process.platform !== "darwin" || !normalized.toLowerCase().endsWith(".app") || !fs.existsSync(normalized)) {
    return normalized;
  }

  const directCandidate = path.join(normalized, "Contents", "MacOS", path.basename(normalized, ".app"));
  if (fs.existsSync(directCandidate)) {
    return directCandidate;
  }

  const macOsDir = path.join(normalized, "Contents", "MacOS");
  if (!fs.existsSync(macOsDir)) {
    return normalized;
  }

  for (const entryName of fs.readdirSync(macOsDir)) {
    const entryPath = path.join(macOsDir, entryName);
    try {
      if (fs.statSync(entryPath).isFile()) {
        return entryPath;
      }
    } catch (error) {
      continue;
    }
  }

  return normalized;
}

function resolveTraeLaunchCommand(command) {
  return resolveMacAppBundleExecutable(command);
}

function resolveTraeLaunchTarget() {
  const configuredCommand = String(process.env.TRAE_BIN || "").trim();
  if (!configuredCommand) {
    throw new Error("Set TRAE_BIN to the Trae executable path or app bundle before running start:trae");
  }

  const command = resolveTraeLaunchCommand(configuredCommand);
  const args = parseLaunchArgs(process.env.TRAE_ARGS || "");
  if (!hasRemoteDebuggingPortArg(args)) {
    args.push(`--remote-debugging-port=${REMOTE_DEBUGGING_PORT}`);
  }

  const projectArg = resolveProjectArg();
  if (projectArg && !args.includes(projectArg)) {
    args.push(projectArg);
  }

  return {
    command,
    args
  };
}

async function waitForDebugger(childProcess) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < START_TIMEOUT_MS) {
    if (childProcess.exitCode !== null) {
      break;
    }

    try {
      if (WAIT_FOR_TARGET) {
        return await discoverTraeTarget({
          port: REMOTE_DEBUGGING_PORT
        });
      }
      return {
        version: await getDebuggerVersion({
          port: REMOTE_DEBUGGING_PORT
        })
      };
    } catch (error) {
      await sleep(250);
    }
  }
  return null;
}

async function main() {
  const target = resolveTraeLaunchTarget();
  const child = spawn(target.command, target.args, {
    stdio: "inherit",
    env: {
      ...process.env
    }
  });

  const debuggerInfo = await waitForDebugger(child);
  if (!debuggerInfo) {
    child.kill();
    console.error(
      JSON.stringify(
        {
          code: "TRAE_DEBUGGER_NOT_READY",
          message: "Trae did not expose a remote debugging endpoint in time",
          port: REMOTE_DEBUGGING_PORT,
          timeoutMs: START_TIMEOUT_MS
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        message: WAIT_FOR_TARGET ? "Trae debugger and page target are ready" : "Trae debugger endpoint is ready",
        port: REMOTE_DEBUGGING_PORT,
        target: debuggerInfo.target
          ? {
              id: debuggerInfo.target.id,
              title: debuggerInfo.target.title,
              url: debuggerInfo.target.url
            }
          : null,
        browser: debuggerInfo.version?.Browser || null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        code: "TRAE_START_FAILED",
        message: error.message,
        stack: error.stack
      },
      null,
      2
    )
  );
  process.exit(1);
});
