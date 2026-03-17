const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  TraeApiClient,
  formatDelegateToolResult,
  formatStatusToolResult,
  getBundledQuickstartDefaults,
  resolvePluginRuntimeConfig,
  stripDuplicateFinalText
} = require("./traeapi-client");

test("resolvePluginRuntimeConfig reads plugin config from api.config", () => {
  const config = resolvePluginRuntimeConfig({
    config: {
      plugins: {
        entries: {
          "trae-ide": {
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
    healthSummary: "ok",
    readySummary: "cdp"
  });
  assert.equal(statusText.includes("Automation ready: yes"), true);

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
  assert.equal(delegateText.includes("Final reply"), true);
  assert.equal(delegateText.includes("step 1"), true);
  assert.equal(delegateText.includes("1. final answer"), false);
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

test("getBundledQuickstartDefaults picks the macOS launcher when available", () => {
  const defaults = getBundledQuickstartDefaults({
    platform: "darwin",
    execPath: "/usr/local/bin/node"
  });

  assert.equal(defaults.quickstartCommand.includes("start-traeapi.command"), true);
});