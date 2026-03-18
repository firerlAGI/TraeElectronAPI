const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const packageJson = require("../../package.json");
const { createGatewayServer, startGatewayServer } = require("./gateway");

function createMockAutomationDriver() {
  const calls = [];
  const preparedSessions = [];
  return {
    calls,
    preparedSessions,
    async getReadiness() {
      return {
        ready: true,
        mode: "mock",
        target: {
          id: "mock-target",
          title: "Mock Trae Window",
          url: "mock://trae"
        },
        details: {
          composerFound: true,
          sendButtonFound: true
        }
      };
    },
    getSnapshot() {
      return {
        mode: "mock",
        queuedRequestCount: 0
      };
    },
    normalizeError(error, fallbackCode = "AUTOMATION_ERROR") {
      return {
        code: error.code || fallbackCode,
        message: error.message || "Unknown automation error",
        details: error.details || {}
      };
    },
    async prepareSession(payload) {
      preparedSessions.push(payload);
      const requestId = `prepare-${preparedSessions.length}`;
      return {
        status: "ok",
        requestId,
        channel: payload.channel || "trae:session:prepare",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        prepared: true,
        sessionId: payload.sessionId,
        preparation: {
          clicked: true,
          trigger: "new_chat"
        }
      };
    },
    dispatchRequest(payload) {
      calls.push(payload);
      const requestId = `mock-${calls.length}`;
      if (payload.channel === "trae:conversation:stream") {
        const response = new Promise((resolve) => {
          setTimeout(() => {
            if (payload.onEvent) {
              payload.onEvent({ type: "replace", data: "A" });
              payload.onEvent({ type: "delta", data: "B" });
              payload.onEvent({ type: "done" });
            }
            resolve({
              status: "ok",
              requestId,
              channel: payload.channel,
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              events: [
                { type: "replace", data: "A" },
                { type: "delta", data: "B" },
                { type: "done" }
              ],
              chunks: ["A", "B"],
              response: {
                text: "AB"
              }
            });
          }, 10);
        });
        return { requestId, response };
      }

      const response = Promise.resolve({
        status: "ok",
        requestId,
        channel: payload.channel,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        events: [
          { type: "replace", data: "reply" },
          { type: "done" }
        ],
        chunks: ["reply"],
        response: {
          text: "reply"
        }
      });
      return { requestId, response };
    }
  };
}

function readResponseBody(response) {
  return new Promise((resolve) => {
    let data = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      data += chunk;
    });
    response.on("end", () => resolve(data));
  });
}

function sendJsonRequest(port, { method, path, headers, body, parseJson = true }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          "content-type": "application/json",
          ...(headers || {})
        }
      },
      async (response) => {
        const text = await readResponseBody(response);
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          text,
          json: parseJson && text ? JSON.parse(text) : null
        });
      }
    );
    request.on("error", reject);
    if (body !== undefined) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}

test("session creation, message send, status lookup and idempotent replay", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const createSessionResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    headers: {
      "idempotency-key": "create-session-1"
    },
    body: {
      metadata: { user: "tester" }
    }
  });

  assert.equal(createSessionResponse.statusCode, 201);
  assert.equal(createSessionResponse.json.success, true);
  const sessionId = createSessionResponse.json.data.session.sessionId;

  const sendMessageResponse = await sendJsonRequest(port, {
    method: "POST",
    path: `/v1/sessions/${sessionId}/messages`,
    headers: {
      "idempotency-key": "send-message-1"
    },
    body: {
      content: "hello"
    }
  });
  assert.equal(sendMessageResponse.statusCode, 200);
  assert.equal(sendMessageResponse.json.success, true);
  assert.equal(sendMessageResponse.json.data.result.status, "ok");
  assert.equal(driver.calls.length, 1);

  const replayedResponse = await sendJsonRequest(port, {
    method: "POST",
    path: `/v1/sessions/${sessionId}/messages`,
    headers: {
      "idempotency-key": "send-message-1"
    },
    body: {
      content: "hello"
    }
  });
  assert.equal(replayedResponse.statusCode, 200);
  assert.equal(replayedResponse.json.meta.replayed, true);
  assert.equal(driver.calls.length, 1);

  const sessionStatusResponse = await sendJsonRequest(port, {
    method: "GET",
    path: `/v1/sessions/${sessionId}`
  });
  assert.equal(sessionStatusResponse.statusCode, 200);
  assert.equal(sessionStatusResponse.json.data.session.status, "completed");

  await new Promise((resolve) => server.close(resolve));
});

test("session creation can immediately prepare a fresh Trae chat", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const createSessionResponse = await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/sessions",
      body: {
        metadata: {
          source: "test"
        },
        prepare: true
      }
    });

    assert.equal(createSessionResponse.statusCode, 201);
    assert.equal(createSessionResponse.json.success, true);
    assert.equal(createSessionResponse.json.data.prepared, true);
    assert.equal(createSessionResponse.json.data.preparation.preparation.trigger, "new_chat");
    assert.equal(driver.preparedSessions.length, 1);
    assert.equal(driver.preparedSessions[0].sessionId, createSessionResponse.json.data.session.sessionId);
    assert.equal(createSessionResponse.json.data.session.lastPreparation.preparation.trigger, "new_chat");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("concurrent session requests stay associated with the correct response", async () => {
  const driver = {
    calls: [],
    async getReadiness() {
      return {
        ready: true
      };
    },
    normalizeError(error, fallbackCode = "AUTOMATION_ERROR") {
      return {
        code: error.code || fallbackCode,
        message: error.message || "Unknown automation error",
        details: error.details || {}
      };
    },
    dispatchRequest(payload) {
      this.calls.push(payload);
      const requestId = `concurrent-${this.calls.length}`;
      const isFirst = payload.body.content === "first-message";
      const response = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            status: "ok",
            requestId,
            channel: payload.channel,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            events: [
              { type: "replace", data: isFirst ? "A" : "B" },
              { type: "done" }
            ],
            chunks: [isFirst ? "A" : "B"],
            response: {
              text: isFirst ? "A" : "B"
            }
          });
        }, isFirst ? 25 : 5);
      });
      return { requestId, response };
    }
  };
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const [sessionResponseA, sessionResponseB] = await Promise.all([
    sendJsonRequest(port, {
      method: "POST",
      path: "/v1/sessions",
      body: {}
    }),
    sendJsonRequest(port, {
      method: "POST",
      path: "/v1/sessions",
      body: {}
    })
  ]);
  const sessionIdA = sessionResponseA.json.data.session.sessionId;
  const sessionIdB = sessionResponseB.json.data.session.sessionId;

  const [messageResponseA, messageResponseB] = await Promise.all([
    sendJsonRequest(port, {
      method: "POST",
      path: `/v1/sessions/${sessionIdA}/messages`,
      body: { content: "first-message" }
    }),
    sendJsonRequest(port, {
      method: "POST",
      path: `/v1/sessions/${sessionIdB}/messages`,
      body: { content: "second-message" }
    })
  ]);
  assert.equal(messageResponseA.statusCode, 200);
  assert.equal(messageResponseB.statusCode, 200);
  assert.deepEqual(messageResponseA.json.data.result.chunks, ["A"]);
  assert.deepEqual(messageResponseB.json.data.result.chunks, ["B"]);
  assert.notEqual(messageResponseA.json.data.requestId, messageResponseB.json.data.requestId);
  assert.equal(driver.calls.length, 2);
  assert.equal(driver.calls[0].body.sessionId !== driver.calls[1].body.sessionId, true);

  await new Promise((resolve) => server.close(resolve));
});

test("stream endpoint returns incremental events and closes the connection", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const createSessionResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    body: {}
  });
  const sessionId = createSessionResponse.json.data.session.sessionId;

  const streamResponse = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method: "POST",
        path: `/v1/sessions/${sessionId}/messages/stream`,
        headers: {
          "content-type": "application/json"
        }
      },
      async (response) => {
        const text = await readResponseBody(response);
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          text
        });
      }
    );
    request.on("error", reject);
    request.write(JSON.stringify({ content: "stream please" }));
    request.end();
  });

  assert.equal(streamResponse.statusCode, 200);
  assert.equal(String(streamResponse.headers["content-type"]).startsWith("text/event-stream"), true);
  assert.equal(streamResponse.text.includes("event: open"), true);
  assert.equal(streamResponse.text.includes("event: delta"), true);
  assert.equal(streamResponse.text.includes("event: done"), true);
  assert.equal(streamResponse.text.includes("\"type\":\"replace\""), true);

  await new Promise((resolve) => server.close(resolve));
});

test("openapi routes expose machine-readable specs without auth", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    authToken: "task4-token",
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const openApiJsonResponse = await sendJsonRequest(port, {
      method: "GET",
      path: "/openapi.json"
    });
    assert.equal(openApiJsonResponse.statusCode, 200);
    assert.equal(openApiJsonResponse.json.openapi, "3.1.0");
    assert.equal(openApiJsonResponse.json.info.version, packageJson.version);
    assert.equal(openApiJsonResponse.json.servers[0].url, `http://127.0.0.1:${port}`);
    assert.ok(openApiJsonResponse.json.paths["/v1/sessions"]);
    assert.ok(openApiJsonResponse.json.paths["/v1/chat"]);

    const openApiYamlResponse = await sendJsonRequest(port, {
      method: "GET",
      path: "/openapi.yaml",
      parseJson: false
    });
    assert.equal(openApiYamlResponse.statusCode, 200);
    assert.equal(String(openApiYamlResponse.headers["content-type"]).startsWith("application/yaml"), true);
    assert.match(openApiYamlResponse.text, /openapi: "3\.1\.0"/);
    assert.match(openApiYamlResponse.text, /"\/v1\/sessions":/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("chat convenience endpoint auto-creates sessions, replays idempotently, and can reuse a session", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const firstResponse = await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/chat",
      headers: {
        "idempotency-key": "chat-once"
      },
      body: {
        content: "hello from convenience route",
        sessionMetadata: {
          client: "chat-convenience"
        },
        metadata: {
          turn: 1
        }
      }
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(firstResponse.json.data.sessionCreated, true);
    assert.equal(firstResponse.json.data.session.metadata.client, "chat-convenience");
    assert.equal(firstResponse.json.data.result.response.text, "reply");
    assert.equal(driver.calls.length, 1);
    const sessionId = firstResponse.json.data.sessionId;

    const replayedResponse = await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/chat",
      headers: {
        "idempotency-key": "chat-once"
      },
      body: {
        content: "hello from convenience route",
        sessionMetadata: {
          client: "chat-convenience"
        },
        metadata: {
          turn: 1
        }
      }
    });
    assert.equal(replayedResponse.statusCode, 200);
    assert.equal(replayedResponse.json.meta.replayed, true);
    assert.equal(replayedResponse.json.data.sessionId, sessionId);
    assert.equal(driver.calls.length, 1);

    const reuseResponse = await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/chat",
      body: {
        sessionId,
        content: "follow-up question"
      }
    });
    assert.equal(reuseResponse.statusCode, 200);
    assert.equal(reuseResponse.json.data.sessionCreated, false);
    assert.equal(reuseResponse.json.data.sessionId, sessionId);
    assert.equal(driver.calls.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("chat stream convenience endpoint auto-creates a session and exposes sessionCreated in events", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const streamResponse = await new Promise((resolve, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port,
          method: "POST",
          path: "/v1/chat/stream",
          headers: {
            "content-type": "application/json"
          }
        },
        async (response) => {
          const text = await readResponseBody(response);
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            text
          });
        }
      );
      request.on("error", reject);
      request.write(JSON.stringify({ content: "stream via convenience route" }));
      request.end();
    });

    assert.equal(streamResponse.statusCode, 200);
    assert.equal(String(streamResponse.headers["content-type"]).startsWith("text/event-stream"), true);
    assert.equal(streamResponse.text.includes("event: open"), true);
    assert.equal(streamResponse.text.includes("event: done"), true);
    assert.equal(streamResponse.text.includes("\"sessionCreated\":true"), true);
    assert.equal(driver.calls.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("requests are rejected when auth is enabled and the token is missing", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    authToken: "task4-token",
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const unauthorizedResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    body: {}
  });
  assert.equal(unauthorizedResponse.statusCode, 401);
  assert.equal(unauthorizedResponse.json.code, "UNAUTHORIZED");
  assert.equal(driver.calls.length, 0);

  const authorizedResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    headers: {
      authorization: "Bearer task4-token"
    },
    body: {}
  });
  assert.equal(authorizedResponse.statusCode, 201);
  assert.equal(authorizedResponse.json.success, true);

  await new Promise((resolve) => server.close(resolve));
});

test("chat UI route returns HTML even when API auth is enabled", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    authToken: "task4-token",
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const response = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        method: "GET",
        path: "/chat"
      },
      async (incoming) => {
        const text = await readResponseBody(incoming);
        resolve({
          statusCode: incoming.statusCode,
          headers: incoming.headers,
          text
        });
      }
    );
    request.on("error", reject);
    request.end();
  });

  assert.equal(response.statusCode, 200);
  assert.equal(String(response.headers["content-type"]).startsWith("text/html"), true);
  assert.equal(response.text.includes("Trae Bridge"), true);
  assert.equal(response.text.includes("/v1/sessions"), true);
  assert.equal(driver.calls.length, 0);

  await new Promise((resolve) => server.close(resolve));
});

test("when automation is not ready, readiness probe and message send return an error", async () => {
  const { server } = createGatewayServer({
    automationDriver: {
      async getReadiness() {
        return {
          ready: false,
          error: {
            code: "CDP_TARGET_NOT_FOUND",
            message: "No matching Trae page target was found"
          }
        };
      },
      dispatchRequest() {
        throw new Error("should not be called");
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const readyResponse = await sendJsonRequest(port, {
    method: "GET",
    path: "/ready"
  });
  assert.equal(readyResponse.statusCode, 503);
  assert.equal(readyResponse.json.code, "AUTOMATION_NOT_READY");

  const createSessionResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    body: {}
  });
  const sessionId = createSessionResponse.json.data.session.sessionId;

  const sendMessageResponse = await sendJsonRequest(port, {
    method: "POST",
    path: `/v1/sessions/${sessionId}/messages`,
    body: {
      content: "hello"
    }
  });
  assert.equal(sendMessageResponse.statusCode, 503);
  assert.equal(sendMessageResponse.json.code, "AUTOMATION_NOT_READY");

  await new Promise((resolve) => server.close(resolve));
});

test("origin validation and rate limiting are enforced", async () => {
  const driver = createMockAutomationDriver();
  const { server } = createGatewayServer({
    allowedOrigins: ["https://trusted.local"],
    rateLimitMaxRequests: 2,
    rateLimitWindowMs: 5000,
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const badOriginResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    headers: {
      origin: "https://bad.local"
    },
    body: {}
  });
  assert.equal(badOriginResponse.statusCode, 403);
  assert.equal(badOriginResponse.json.code, "FORBIDDEN_ORIGIN");

  const firstResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    headers: {
      origin: "https://trusted.local"
    },
    body: {}
  });
  assert.equal(firstResponse.statusCode, 201);

  const secondResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    headers: {
      origin: "https://trusted.local"
    },
    body: {}
  });
  assert.equal(secondResponse.statusCode, 201);

  const limitedResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    headers: {
      origin: "https://trusted.local"
    },
    body: {}
  });
  assert.equal(limitedResponse.statusCode, 429);
  assert.equal(limitedResponse.json.code, "RATE_LIMITED");

  await new Promise((resolve) => server.close(resolve));
});

test("automation failures are normalized and persisted on the session", async () => {
  const driver = {
    async getReadiness() {
      return {
        ready: true
      };
    },
    normalizeError(error, fallbackCode = "AUTOMATION_ERROR") {
      return {
        code: error.code || fallbackCode,
        message: error.message || "Unknown automation error",
        details: error.details || {}
      };
    },
    dispatchRequest() {
      return {
        requestId: "timeout-1",
        response: Promise.reject({
          code: "AUTOMATION_RESPONSE_TIMEOUT",
          message: "response timed out",
          details: {
            timeoutMs: 20
          }
        })
      };
    }
  };
  const { server } = createGatewayServer({
    automationDriver: driver
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const createSessionResponse = await sendJsonRequest(port, {
    method: "POST",
    path: "/v1/sessions",
    body: {}
  });
  const sessionId = createSessionResponse.json.data.session.sessionId;

  const sendMessageResponse = await sendJsonRequest(port, {
    method: "POST",
    path: `/v1/sessions/${sessionId}/messages`,
    body: {
      content: "hello"
    }
  });
  assert.equal(sendMessageResponse.statusCode, 502);
  assert.equal(sendMessageResponse.json.code, "AUTOMATION_RESPONSE_TIMEOUT");

  const sessionStatusResponse = await sendJsonRequest(port, {
    method: "GET",
    path: `/v1/sessions/${sessionId}`
  });
  assert.equal(sessionStatusResponse.statusCode, 200);
  assert.equal(sessionStatusResponse.json.data.session.status, "error");
  assert.equal(sessionStatusResponse.json.data.session.lastError.code, "AUTOMATION_RESPONSE_TIMEOUT");

  await new Promise((resolve) => server.close(resolve));
});

test("loopback restriction, secret redaction and audit log fields stay in place", async () => {
  const driver = createMockAutomationDriver();
  const auditEvents = [];
  const originalLog = console.log;
  console.log = (line) => {
    auditEvents.push(line);
  };
  try {
    const { server } = createGatewayServer({
      automationDriver: driver
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    const remoteBlockedResponse = await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/sessions",
      headers: {
        "x-forwarded-for": "10.0.0.8"
      },
      body: {}
    });
    assert.equal(remoteBlockedResponse.statusCode, 403);
    assert.equal(remoteBlockedResponse.json.code, "FORBIDDEN_REMOTE");

    await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/sessions",
      headers: {
        authorization: "Bearer should-hide"
      },
      body: {
        metadata: {
          token: "abc",
          nested: {
            password: "123"
          }
        }
      }
    });

    await new Promise((resolve) => server.close(resolve));
  } finally {
    console.log = originalLog;
  }

  const auditPayloads = auditEvents
    .map((entry) => {
      try {
        return JSON.parse(entry);
      } catch (error) {
        return null;
      }
    })
    .filter((entry) => entry && entry.event === "gateway_audit");

  assert.equal(auditPayloads.length >= 2, true);
  const matched = auditPayloads.find((entry) => entry.pathname === "/v1/sessions" && entry.statusCode === 201);
  assert.ok(matched);
  assert.equal(matched.headers.authorization, "***");
  assert.equal(matched.body.metadata.token, "***");
  assert.equal(matched.body.metadata.nested.password, "***");
});

test("health and readiness expose runtime metrics and automation details", async () => {
  const { server } = createGatewayServer({
    automationDriver: {
      async getReadiness() {
        return {
          ready: true,
          target: {
            id: "page-1",
            title: "Trae",
            url: "https://trae.local"
          },
          details: {
            composerFound: true,
            sendButtonFound: true
          }
        };
      },
      getSnapshot() {
        return {
          mode: "mock",
          queuedRequestCount: 0
        };
      },
      dispatchRequest() {
        return {
          requestId: "unused",
          response: Promise.resolve({
            status: "ok",
            requestId: "unused",
            channel: "trae:conversation:send",
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            events: [],
            chunks: [],
            response: {
              text: ""
            }
          })
        };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const healthResponse = await sendJsonRequest(port, {
    method: "GET",
    path: "/health"
  });
  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthResponse.json.data.status, "ok");
  assert.equal(healthResponse.json.data.automation.ready, true);
  assert.equal(typeof healthResponse.json.data.metrics.totalRequests, "number");

  const readyResponse = await sendJsonRequest(port, {
    method: "GET",
    path: "/ready"
  });
  assert.equal(readyResponse.statusCode, 200);
  assert.equal(readyResponse.json.data.status, "ready");
  assert.equal(readyResponse.json.data.automation.target.title, "Trae");

  await new Promise((resolve) => server.close(resolve));
});

test("debug automation endpoint returns selector diagnostics when enabled", async () => {
  const { server } = createGatewayServer({
    enableDebugEndpoints: true,
    automationDriver: {
      async getReadiness() {
        return {
          ready: true,
          target: {
            id: "page-1",
            title: "Trae",
            url: "https://trae.local"
          }
        };
      },
      async getDiagnostics() {
        return {
          ready: false,
          target: {
            id: "page-1",
            title: "Trae",
            url: "https://trae.local"
          },
          diagnostics: {
            selectorDiagnostics: {
              composer: [{ selector: "textarea", count: 0, matches: [] }]
            },
            genericCandidates: {
              composer: [{ tagName: "textarea" }],
              button: [{ tagName: "button" }]
            }
          }
        };
      },
      dispatchRequest() {
        return {
          requestId: "unused",
          response: Promise.resolve({
            status: "ok",
            requestId: "unused",
            channel: "trae:conversation:send",
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            events: [],
            chunks: [],
            response: {
              text: ""
            }
          })
        };
      }
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  const response = await sendJsonRequest(port, {
    method: "GET",
    path: "/debug/automation"
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json.success, true);
  assert.equal(response.json.data.target.title, "Trae");
  assert.equal(response.json.data.diagnostics.genericCandidates.button[0].tagName, "button");

  await new Promise((resolve) => server.close(resolve));
});

test("request trace logs include durations and aggregate error codes", async () => {
  const traceEvents = [];
  const originalLog = console.log;
  console.log = (line) => {
    traceEvents.push(line);
  };
  try {
    const { server, getSnapshot } = createGatewayServer({
      automationDriver: createMockAutomationDriver()
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    const notFoundResponse = await sendJsonRequest(port, {
      method: "GET",
      path: "/missing"
    });
    assert.equal(notFoundResponse.statusCode, 404);

    const createSessionResponse = await sendJsonRequest(port, {
      method: "POST",
      path: "/v1/sessions",
      body: {}
    });
    assert.equal(createSessionResponse.statusCode, 201);

    const snapshot = getSnapshot();
    assert.equal(snapshot.metrics.failedRequests >= 1, true);
    assert.equal(snapshot.metrics.errorByCode.NOT_FOUND >= 1, true);

    await new Promise((resolve) => server.close(resolve));
  } finally {
    console.log = originalLog;
  }

  const parsedTraceEvents = traceEvents
    .map((entry) => {
      try {
        return JSON.parse(entry);
      } catch (error) {
        return null;
      }
    })
    .filter((entry) => entry && entry.event === "gateway_request_trace");
  const notFoundTrace = parsedTraceEvents.find((entry) => entry.pathname === "/missing" && entry.statusCode === 404);
  assert.ok(notFoundTrace);
  assert.equal(typeof notFoundTrace.durationMs, "number");
});

test("gateway host restriction only allows local loopback addresses", () => {
  assert.throws(
    () => {
      startGatewayServer({
        host: "0.0.0.0",
        port: 0,
        automationDriver: createMockAutomationDriver()
      });
    },
    (error) => {
      assert.equal(error.code, "INVALID_LISTEN_HOST");
      return true;
    }
  );
});
