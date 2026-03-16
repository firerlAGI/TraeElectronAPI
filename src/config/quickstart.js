const path = require("node:path");

const DEFAULT_ISOLATED_DEBUG_PORT = 9333;
const DEFAULT_ISOLATED_PROFILE_DIRNAME = "trae-quickstart-profile";

function parseArgList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyArgList(args) {
  return Array.isArray(args) ? args.join(" ") : "";
}

function upsertArgByPrefix(args, prefix, value) {
  const nextArgs = Array.isArray(args) ? args.filter((item) => !String(item).startsWith(prefix)) : [];
  if (value) {
    nextArgs.push(value);
  }
  return nextArgs;
}

function resolveIsolatedDebugPort(config = {}) {
  const configuredPort = Number(config.remoteDebuggingPort || 9222);
  const requestedPort = Number(config.quickstartRemoteDebuggingPort || DEFAULT_ISOLATED_DEBUG_PORT);
  if (requestedPort !== configuredPort) {
    return requestedPort;
  }
  return configuredPort + 111;
}

function buildQuickstartRuntimePlan(config = {}) {
  const rootDir = path.resolve(config.rootDir || process.cwd());
  const configuredDebugPort = Number(config.remoteDebuggingPort || 9222);
  const traeArgs = String(config.traeArgs || "").trim();
  const configuredArgs = parseArgList(traeArgs);
  const isolatedUserDataDir = path.resolve(
    String(config.quickstartUserDataDir || path.join(rootDir, ".runtime", DEFAULT_ISOLATED_PROFILE_DIRNAME))
  );
  const isolatedDebugPort = resolveIsolatedDebugPort(config);
  const isolatedArgs = upsertArgByPrefix(configuredArgs, "--user-data-dir=", `--user-data-dir=${isolatedUserDataDir}`);
  const commonEnv = {
    TRAE_BIN: String(config.traeBin || ""),
    TRAE_PROJECT_PATH: String(config.projectPath || ""),
    TRAE_CDP_START_TIMEOUT_MS: String(config.traeStartTimeoutMs || 30000)
  };

  return {
    configured: {
      label: "configured",
      debuggerPort: configuredDebugPort,
      userDataDir: null,
      env: {
        ...commonEnv,
        TRAE_REMOTE_DEBUGGING_PORT: String(configuredDebugPort),
        TRAE_ARGS: stringifyArgList(configuredArgs)
      }
    },
    isolated: {
      label: "isolated",
      debuggerPort: isolatedDebugPort,
      userDataDir: isolatedUserDataDir,
      env: {
        ...commonEnv,
        TRAE_REMOTE_DEBUGGING_PORT: String(isolatedDebugPort),
        TRAE_ARGS: stringifyArgList(isolatedArgs)
      }
    }
  };
}

module.exports = {
  DEFAULT_ISOLATED_DEBUG_PORT,
  DEFAULT_ISOLATED_PROFILE_DIRNAME,
  buildQuickstartRuntimePlan,
  parseArgList,
  stringifyArgList,
  upsertArgByPrefix
};
