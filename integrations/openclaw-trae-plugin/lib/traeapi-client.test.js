const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const {
  DEFAULT_AUTO_UPDATE_INTERVAL_MS,
  DEFAULT_AUTO_UPDATE_START_DELAY_MS,
  compareSemanticVersions,
  DEFAULT_UPDATE_CHECK_TIMEOUT_MS,
  DEFAULT_UPDATE_COMMAND_TIMEOUT_MS,
  TraeApiClient,
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
} = require("./traeapi-client");

test("resolvePluginRuntimeConfig reads plugin config from api.config", () => {
  const config = resolvePluginRuntimeConfig({
    config: {
      plugins: {
        entries: {
          "traeclaw": {
            config: {
              baseUrl: "http://127.0.0.1:9999/",
              token: "abc",
              autoStart: true,
              readyTimeoutMs: 1234,
              requestTimeoutMs: 5678
            }
          }
        }
      }
    }
  });

  assert.equal(config.baseUrl, "http://127.0.0.1:9999");
  assert.equal(config.token, "abc");
  assert.equal(config.autoStart, true);
  assert.equal(config.readyTimeoutMs, 1234);
  assert.equal(config.requestTimeoutMs, 5678);
  assert.equal(config.checkForUpdates, true);
  assert.equal(config.autoApplyUpdates, false);
  assert.equal(config.openclawCommand, "openclaw");
  assert.equal(config.updateCheckTimeoutMs, DEFAULT_UPDATE_CHECK_TIMEOUT_MS);
  assert.equal(config.updateCommandTimeoutMs, DEFAULT_UPDATE_COMMAND_TIMEOUT_MS);
  assert.equal(config.autoUpdateStartDelayMs, DEFAULT_AUTO_UPDATE_START_DELAY_MS);
  assert.equal(config.autoUpdateIntervalMs, DEFAULT_AUTO_UPDATE_INTERVAL_MS);
  assert.equal(config.packageName, "traeclaw");
  assert.match(config.pluginVersion, /^\d+\.\d+\.\d+/);
});

test("resolvePluginRuntimeConfig merges legacy trae-ide entry config during migration", () => {
  const config = resolvePluginRuntimeConfig({
    config: {
      plugins: {
        entries: {
          "trae-ide": {
            config: {
              baseUrl: "http://127.0.0.1:9898/",
              token: "legacy-token",
              quickstartCommand: "\"/tmp/legacy/start-traeapi.command\""
            }
          },
          traeclaw: {
            config: {
              baseUrl: "http://127.0.0.1:9999/",
              autoStart: true
            }
          }
        }
      }
    }
  });

  assert.equal(config.baseUrl, "http://127.0.0.1:9999");
  assert.equal(config.autoStart, true);
  assert.equal(config.token, "legacy-token");
  assert.equal(config.quickstartCommand, "\"/tmp/legacy/start-traeapi.command\"");
});

test("stripDuplicateFinalText removes final reply from process chunks", () => {
  assert.deepEqual(stripDuplicateFinalText(["step 1", "done", "done"], "done"), ["step 1"]);
});

test("formatters produce readable summaries", () => {
  const statusText = formatStatusToolResult({
    baseUrl: "http://127.0.0.1:8787",
    gatewayReachable: true,
    ready: true,
    autoStarted: false,
    updateInfo: {
      currentVersion: "0.2.1",
      latestVersion: "0.2.2",
      updateAvailable: true,
      autoApplyEnabled: true,
      pendingRestart: true,
      lastUpdateStatus: "updated",
      lastUpdateSource: "auto",
      lastUpdateCheckAt: "2026-03-19T07:00:00.000Z",
      lastUpdateAttemptAt: "2026-03-19T07:00:05.000Z",
      lastUpdateMessage: "Plugin updated successfully. Restart OpenClaw Gateway to load the new version.",
      disabled: false,
      errorMessage: ""
    },
    healthSummary: "ok",
    readySummary: "cdp"
  });
  assert.equal(statusText.includes("Automation ready: yes"), true);
  assert.equal(statusText.includes("Plugin version: 0.2.1"), true);
  assert.equal(statusText.includes("Latest plugin version: 0.2.2"), true);
  assert.equal(statusText.includes("Update available: yes"), true);
  assert.equal(statusText.includes("Auto-update: enabled"), true);
  assert.equal(statusText.includes("Restart OpenClaw Gateway: yes"), true);

  const delegateText = formatDelegateToolResult({
    data: {
      sessionId: "s1",
      requestId: "r1",
      sessionCreated: true,
      result: {
        response: {
          text: "final answer"
        },
        chunks: ["step 1", "final answer"]
      }
    }
  });
  assert.equal(delegateText, "final answer");

  const verboseDelegateText = formatDelegateToolResult(
    {
      data: {
        sessionId: "s1",
        requestId: "r1",
        sessionCreated: true,
        result: {
          response: {
            text: "final answer"
          },
          chunks: ["step 1", "final answer"]
        }
      }
    },
    {
      includeProcessText: true
    }
  );
  assert.equal(verboseDelegateText.includes("Final reply"), true);
  assert.equal(verboseDelegateText.includes("step 1"), true);
  assert.equal(verboseDelegateText.includes("1. final answer"), false);

  const newChatText = formatNewChatToolResult({
    data: {
      session: {
        sessionId: "session-new"
      },
      prepared: true,
      preparation: {
        requestId: "prepare-1",
        preparation: {
          trigger: "new_chat"
        }
      }
    }
  });
  assert.equal(newChatText.includes("New Trae chat created."), true);
  assert.equal(newChatText.includes("Session ID: session-new"), true);

  const openProjectText = formatOpenProjectToolResult({
    projectName: "my-project",
    projectPath: "/tmp/my-project",
    ready: true,
    autoStarted: true,
    alreadyOpen: false,
    windowTitle: "my-project - Trae"
  });
  assert.equal(openProjectText.includes("Trae project opened."), true);
  assert.equal(openProjectText.includes("Project: my-project"), true);
  assert.equal(openProjectText.includes("Quickstart triggered: yes"), true);

  const switchModeText = formatSwitchModeToolResult({
    autoStarted: true,
    data: {
      mode: "ide",
      previousMode: "solo",
      changed: true,
      target: {
        title: "my-project - Trae"
      }
    }
  });
  assert.equal(switchModeText.includes("Trae mode switched."), true);
  assert.equal(switchModeText.includes("Current mode: ide"), true);
  assert.equal(switchModeText.includes("Quickstart triggered: yes"), true);

  const updateText = formatUpdateToolResult({
    pluginId: "traeclaw",
    packageName: "traeclaw",
    previousVersion: "0.2.1",
    installedVersion: "0.2.2",
    latestVersion: "0.2.2",
    changed: true,
    alreadyLatest: false,
    restartRequired: true,
    warningMessage: "",
    commandOutputSummary: "updated traeclaw"
  });
  assert.equal(updateText.includes("TraeClaw plugin updated."), true);
  assert.equal(updateText.includes("Installed version: 0.2.2"), true);
  assert.equal(updateText.includes("Restart OpenClaw Gateway: yes"), true);
});

test("compareSemanticVersions handles stable and prerelease versions", () => {
  assert.equal(compareSemanticVersions("0.2.2", "0.2.1") > 0, true);
  assert.equal(compareSemanticVersions("1.0.0", "1.0.0-beta.1") > 0, true);
  assert.equal(compareSemanticVersions("1.0.0-beta.2", "1.0.0-beta.10") < 0, true);
  assert.equal(compareSemanticVersions("1.0.0", "1.0.0"), 0);
});

test("readInstalledPluginPackageMetadata reads the package name and version", () => {
  const metadata = readInstalledPluginPackageMetadata();
  assert.equal(metadata.packageName, "traeclaw");
  assert.match(metadata.version, /^\d+\.\d+\.\d+/);
});

test("fetchLatestPublishedVersion reads dist-tags.latest from the npm registry payload", async () => {
  const result = await fetchLatestPublishedVersion({
    packageName: "traeclaw",
    timeoutMs: 100,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          "dist-tags": {
            latest: "0.2.9"
          }
        });
      }
    })
  });

  assert.equal(result.packageName, "traeclaw");
  assert.equal(result.latestVersion, "0.2.9");
});

test("resolveReplyText falls back to the last chunk when response text is empty", () => {
  assert.equal(
    resolveReplyText({
      data: {
        result: {
          response: {
            text: ""
          },
          chunks: ["step 1", "delegate ok"]
        }
      }
    }),
    "delegate ok"
  );
});

test("TraeApiClient delegates tasks through /v1/chat", async () => {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/ready") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { automation: { mode: "cdp" } } }));
      return;
    }

    if (req.url === "/v1/chat") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf8");
      });
      req.on("end", () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            data: {
              sessionId: "session-1",
              sessionCreated: true,
              requestId: "request-1",
              echo: parsed.content,
              result: {
                response: {
                  text: "delegate ok"
                },
                chunks: ["step 1", "delegate ok"]
              }
            }
          })
        );
      });
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { status: "ok" } }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: false }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const client = new TraeApiClient({
    baseUrl: `http://127.0.0.1:${port}`,
    token: "",
    autoStart: false,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 5000,
    requestTimeoutMs: 5000
  });

  try {
    const response = await client.delegateTask({
      task: "Fix this bug"
    });
    assert.equal(response.data.result.response.text, "delegate ok");

    const status = await client.getStatus();
    assert.equal(status.gatewayReachable, true);
    assert.equal(status.ready, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("openProject returns early when the requested project is already open", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "trae-open-project-ready-"));
  const projectName = path.basename(projectDir);
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 200,
    requestTimeoutMs: 200
  });

  client.getHealth = async () => ({
    ok: true,
    status: 200,
    json: {
      data: {
        automation: {
          ready: true,
          target: {
            title: `${projectName} - Trae`
          }
        }
      }
    }
  });
  client.startQuickstart = async () => {
    throw new Error("startQuickstart should not be called when the project is already open");
  };

  try {
    const result = await client.openProject({
      projectPath: projectDir
    });
    assert.equal(result.alreadyOpen, true);
    assert.equal(result.autoStarted, false);
    assert.equal(result.windowTitle, `${projectName} - Trae`);
  } finally {
    fs.rmSync(projectDir, {
      recursive: true,
      force: true
    });
  }
});

test("openProject starts quickstart with project overrides and waits for the new title", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "trae-open-project-launch-"));
  const projectName = path.basename(projectDir);
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    quickstartCommand: "\"/tmp/start-traeapi.command\"",
    quickstartCwd: "/tmp",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500
  });

  let healthCallCount = 0;
  let quickstartOptions = null;
  client.getHealth = async () => {
    healthCallCount += 1;
    if (healthCallCount === 1) {
      return {
        ok: true,
        status: 200,
        json: {
          data: {
            automation: {
              ready: true,
              target: {
                title: "old-project - Trae"
              }
            }
          }
        }
      };
    }

    return {
      ok: true,
      status: 200,
      json: {
        data: {
          automation: {
            ready: true,
            target: {
              title: `${projectName} - Trae`
            }
          }
        }
      }
    };
  };
  client.startQuickstart = async (options = {}) => {
    quickstartOptions = options;
  };

  try {
    const result = await client.openProject({
      projectPath: projectDir
    });
    assert.equal(result.alreadyOpen, false);
    assert.equal(result.autoStarted, true);
    assert.equal(result.windowTitle, `${projectName} - Trae`);
    assert.deepEqual(quickstartOptions, {
      envOverrides: {
        TRAE_QUICKSTART_PROJECT_PATH: path.resolve(projectDir),
        TRAE_QUICKSTART_FORCE_FRESH_WINDOW: "1"
      }
    });
  } finally {
    fs.rmSync(projectDir, {
      recursive: true,
      force: true
    });
  }
});

test("delegateTask opens the requested project before sending the task", async () => {
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500
  });

  let openedProjectPath = "";
  let requestedBody = null;
  client.openProject = async ({ projectPath }) => {
    openedProjectPath = projectPath;
    return {
      projectPath,
      ready: true
    };
  };
  client.ensureReady = async () => ({
    ready: true,
    autoStarted: false,
    readyResponse: {
      ok: true,
      json: {
        success: true
      }
    }
  });
  client.request = async (_pathname, options = {}) => {
    requestedBody = options.body;
    return {
      ok: true,
      status: 200,
      json: {
        success: true,
        data: {
          result: {
            response: {
              text: "delegate ok"
            }
          }
        }
      }
    };
  };

  const result = await client.delegateTask({
    task: "Inspect this project",
    projectPath: "/tmp/sample-project"
  });

  assert.equal(openedProjectPath, "/tmp/sample-project");
  assert.equal(requestedBody.content, "Inspect this project");
  assert.equal(result.data.result.response.text, "delegate ok");
});

test("getStatus includes plugin update details without affecting readiness checks", async () => {
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    checkForUpdates: true,
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    updateCheckTimeoutMs: 250,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500
  });

  client.ensureReady = async () => ({
    ready: true,
    autoStarted: false,
    readyResponse: {
      json: {
        data: {
          automation: {
            mode: "ide"
          }
        }
      }
    }
  });
  client.getHealth = async () => ({
    ok: true,
    json: {
      data: {
        status: "ok"
      }
    }
  });
  client.getPluginUpdateInfo = async () => ({
    packageName: "traeclaw",
    currentVersion: "0.2.1",
    latestVersion: "0.2.2",
    updateAvailable: true,
    disabled: false,
    errorMessage: ""
  });

  const status = await client.getStatus();

  assert.equal(status.ready, true);
  assert.equal(status.gatewayReachable, true);
  assert.equal(status.updateInfo.latestVersion, "0.2.2");
  assert.equal(status.updateInfo.updateAvailable, true);
});

test("getPluginUpdateInfo reports disabled checks without hitting the registry", async () => {
  const packageRoot = createTempPluginPackage("0.2.1");
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    checkForUpdates: false,
    packageRoot,
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    updateCheckTimeoutMs: 250,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500
  });

  client.fetchLatestPublishedVersion = async () => {
    throw new Error("should not be called");
  };

  try {
    const updateInfo = await client.getPluginUpdateInfo({
      forceRefresh: true
    });

    assert.equal(updateInfo.disabled, true);
    assert.equal(updateInfo.currentVersion, "0.2.1");
  } finally {
    fs.rmSync(packageRoot, {
      recursive: true,
      force: true
    });
  }
});

test("getPluginUpdateInfo reports when a newer npm version is available", async () => {
  const packageRoot = createTempPluginPackage("0.2.1");
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    checkForUpdates: true,
    packageRoot,
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    updateCheckTimeoutMs: 250,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500
  });

  client.fetchLatestPublishedVersion = async () => ({
    packageName: "traeclaw",
    latestVersion: "0.3.1"
  });

  try {
    const updateInfo = await client.getPluginUpdateInfo({
      forceRefresh: true
    });

    assert.equal(updateInfo.disabled, false);
    assert.equal(updateInfo.latestVersion, "0.3.1");
    assert.equal(updateInfo.updateAvailable, true);
  } finally {
    fs.rmSync(packageRoot, {
      recursive: true,
      force: true
    });
  }
});

function createTempPluginPackage(version = "0.2.1", packageName = "traeclaw") {
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trae-plugin-package-"));
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({ name: packageName, version }, null, 2)}\n`,
    "utf8"
  );
  return packageRoot;
}

function createMockSpawn(onSpawn) {
  return (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};

    process.nextTick(async () => {
      try {
        await onSpawn({
          command,
          args,
          options,
          child
        });
      } catch (error) {
        child.emit("error", error);
      }
    });

    return child;
  };
}

test("updateSelf returns early when the installed plugin is already at the latest version", async () => {
  const packageRoot = createTempPluginPackage("0.2.1");
  let spawnCalled = false;
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    checkForUpdates: true,
    packageRoot,
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    openclawCommand: "openclaw",
    updateCheckTimeoutMs: 250,
    updateCommandTimeoutMs: 500,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500,
    spawnImpl: () => {
      spawnCalled = true;
      throw new Error("spawn should not be called");
    }
  });

  client.fetchLatestPublishedVersion = async () => ({
    packageName: "traeclaw",
    latestVersion: "0.2.1"
  });

  try {
    const result = await client.updateSelf();
    assert.equal(result.alreadyLatest, true);
    assert.equal(result.changed, false);
    assert.equal(result.installedVersion, "0.2.1");
    assert.equal(spawnCalled, false);
  } finally {
    fs.rmSync(packageRoot, {
      recursive: true,
      force: true
    });
  }
});

test("updateSelf runs openclaw plugins update traeclaw and reports the new installed version", async () => {
  const packageRoot = createTempPluginPackage("0.2.1");
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    checkForUpdates: true,
    packageRoot,
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    openclawCommand: "/usr/local/bin/openclaw",
    updateCheckTimeoutMs: 250,
    updateCommandTimeoutMs: 500,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500,
    spawnImpl: createMockSpawn(async ({ command, args, options, child }) => {
      assert.equal(command, "/usr/local/bin/openclaw");
      assert.deepEqual(args, ["plugins", "update", "traeclaw"]);
      assert.equal(Boolean(options.shell), false);
      fs.writeFileSync(
        path.join(packageRoot, "package.json"),
        `${JSON.stringify({ name: "traeclaw", version: "0.2.2" }, null, 2)}\n`,
        "utf8"
      );
      child.stdout.end("updated traeclaw\n");
      child.emit("close", 0, null);
    })
  });

  client.fetchLatestPublishedVersion = async () => ({
    packageName: "traeclaw",
    latestVersion: "0.2.2"
  });

  try {
    const result = await client.updateSelf();
    assert.equal(result.changed, true);
    assert.equal(result.alreadyLatest, true);
    assert.equal(result.previousVersion, "0.2.1");
    assert.equal(result.installedVersion, "0.2.2");
    assert.equal(result.restartRequired, true);
    assert.equal(result.commandOutputSummary.includes("updated traeclaw"), true);
  } finally {
    fs.rmSync(packageRoot, {
      recursive: true,
      force: true
    });
  }
});

test("runAutoUpdateCycle updates the runtime state and marks restart required after a background update", async () => {
  const packageRoot = createTempPluginPackage("0.2.1");
  let updateSelfCalled = 0;
  const config = {
    packageRoot,
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    autoApplyUpdates: true,
    autoUpdateStartDelayMs: 0,
    autoUpdateIntervalMs: 0
  };

  try {
    const cycle = await runAutoUpdateCycle(config, {
      createClient() {
        return {
          async updateSelf() {
            updateSelfCalled += 1;
            fs.writeFileSync(
              path.join(packageRoot, "package.json"),
              `${JSON.stringify({ name: "traeclaw", version: "0.2.2" }, null, 2)}\n`,
              "utf8"
            );
            return {
              pluginId: "traeclaw",
              packageName: "traeclaw",
              previousVersion: "0.2.1",
              installedVersion: "0.2.2",
              latestVersion: "0.2.2",
              changed: true,
              alreadyLatest: true,
              restartRequired: true,
              warningMessage: "",
              commandOutputSummary: "updated traeclaw"
            };
          }
        };
      }
    });

    assert.equal(cycle.ok, true);
    assert.equal(updateSelfCalled, 1);

    const client = new TraeApiClient({
      baseUrl: "http://127.0.0.1:8787",
      token: "",
      autoStart: false,
      checkForUpdates: true,
      autoApplyUpdates: true,
      packageRoot,
      packageName: "traeclaw",
      pluginVersion: "0.2.1",
      updateCheckTimeoutMs: 250,
      updateCommandTimeoutMs: 500,
      quickstartCommand: "",
      quickstartCwd: "",
      readyTimeoutMs: 500,
      requestTimeoutMs: 500
    });
    client.fetchLatestPublishedVersion = async () => ({
      packageName: "traeclaw",
      latestVersion: "0.2.2"
    });

    const updateInfo = await client.getPluginUpdateInfo({
      forceRefresh: true
    });
    assert.equal(updateInfo.autoApplyEnabled, true);
    assert.equal(updateInfo.pendingRestart, true);
    assert.equal(updateInfo.lastUpdateStatus, "updated");
    assert.equal(updateInfo.lastUpdateSource, "auto");
  } finally {
    fs.rmSync(packageRoot, {
      recursive: true,
      force: true
    });
  }
});

test("schedulePluginAutoUpdate schedules a single background cycle when auto-apply is enabled", async () => {
  const calls = [];
  const config = {
    packageRoot: "/tmp/trae-auto-schedule",
    packageName: "traeclaw",
    pluginVersion: "0.2.1",
    autoApplyUpdates: true,
    autoUpdateStartDelayMs: 0,
    autoUpdateIntervalMs: 0
  };

  await new Promise((resolve) => {
    schedulePluginAutoUpdate(config, {
      createClient() {
        return {
          async updateSelf() {
            calls.push("update");
            return {
              changed: false,
              alreadyLatest: true,
              installedVersion: "0.2.1",
              latestVersion: "0.2.1",
              previousVersion: "0.2.1",
              packageName: "traeclaw",
              pluginId: "traeclaw",
              restartRequired: false,
              warningMessage: "",
              commandOutputSummary: ""
            };
          }
        };
      },
      setTimeoutImpl(handler, delayMs) {
        calls.push(`timer:${delayMs}`);
        process.nextTick(async () => {
          await handler();
          resolve();
        });
        return {
          unref() {}
        };
      }
    });
  });

  assert.deepEqual(calls, ["timer:0", "update"]);
});

test("switchMode posts the requested mode to the gateway without a readiness preflight", async () => {
  const client = new TraeApiClient({
    baseUrl: "http://127.0.0.1:8787",
    token: "",
    autoStart: false,
    quickstartCommand: "",
    quickstartCwd: "",
    readyTimeoutMs: 500,
    requestTimeoutMs: 500
  });

  let requestedPath = "";
  let requestedBody = null;
  let ensureReadyCalled = false;
  client.ensureReady = async () => {
    ensureReadyCalled = true;
    return {
      ready: true,
      autoStarted: true,
      readyResponse: {
        ok: true,
        json: {
          success: true
        }
      }
    };
  };
  client.request = async (pathname, options = {}) => {
    requestedPath = pathname;
    requestedBody = options.body;
    return {
      ok: true,
      status: 200,
      json: {
        success: true,
        data: {
          mode: "ide",
          previousMode: "solo",
          changed: true
        }
      }
    };
  };

  const result = await client.switchMode({
    mode: "ide"
  });

  assert.equal(requestedPath, "/v1/mode");
  assert.deepEqual(requestedBody, {
    mode: "ide"
  });
  assert.equal(result.data.mode, "ide");
  assert.equal(result.autoStarted, false);
  assert.equal(ensureReadyCalled, false);
});

test("getBundledQuickstartDefaults picks the macOS launcher when available", () => {
  const defaults = getBundledQuickstartDefaults({
    platform: "darwin",
    execPath: "/usr/local/bin/node"
  });

  assert.equal(defaults.quickstartCommand.includes("start-traeapi.command"), true);
});

test("getBundledQuickstartDefaults prefers the bundled runtime when present", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trae-plugin-runtime-"));
  const packageRoot = path.join(tempRoot, "plugin");
  const bundledRuntimeRoot = path.join(packageRoot, "runtime", "traeapi");
  fs.mkdirSync(path.join(bundledRuntimeRoot, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(bundledRuntimeRoot, "scripts", "quickstart.js"), "console.log('ok');\n", "utf8");
  fs.writeFileSync(path.join(bundledRuntimeRoot, "start-traeapi.command"), "#!/bin/bash\n", "utf8");

  try {
    assert.equal(resolveBundledRuntimeRoot({ packageRoot }), bundledRuntimeRoot);
    const defaults = getBundledQuickstartDefaults({
      packageRoot,
      platform: "darwin",
      execPath: "/usr/local/bin/node"
    });
    assert.equal(defaults.quickstartCommand, `"${path.join(bundledRuntimeRoot, "start-traeapi.command")}"`);
    assert.equal(defaults.quickstartCwd, bundledRuntimeRoot);
  } finally {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true
    });
  }
});
