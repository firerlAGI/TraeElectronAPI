const test = require("node:test");
const assert = require("node:assert/strict");
const { createTraeAutomationDriver, extractAutomationResponse } = require("./dom-driver");

function createDiscoveryResult() {
  return {
    version: {
      Browser: "Chrome/123.0.0.0"
    },
    target: {
      id: "page-1",
      title: "Trae",
      url: "https://trae.local/app",
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/page-1"
    }
  };
}

test("extractAutomationResponse handles new nodes and in-place node growth", () => {
  assert.deepEqual(extractAutomationResponse([{ text: "new reply" }], []), {
    text: "new reply",
    source: "new_nodes",
    snapshotCount: 1
  });

  assert.deepEqual(
    extractAutomationResponse([{ text: "old reply extended" }], [{ text: "old reply" }]),
    {
      text: " extended",
      source: "last_node_growth",
      snapshotCount: 1
    }
  );
});

test("getReadiness returns selector diagnostics for the matched Trae window", async () => {
  const driver = createTraeAutomationDriver({
    activitySelectors: [],
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true,
          composerFound: true,
          sendButtonFound: true,
          responseSelectorFound: false
        };
      },
      async captureResponseSnapshot() {
        return [];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const readiness = await driver.getReadiness();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.target.title, "Trae");
  assert.deepEqual(readiness.details, {
    ready: true,
    composerFound: true,
    sendButtonFound: true,
    responseSelectorFound: false
  });
});

test("getDiagnostics returns target metadata and selector match summaries", async () => {
  const driver = createTraeAutomationDriver({
    activitySelectors: [],
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: false,
          composerFound: true,
          sendButtonFound: false
        };
      },
      async inspectDiagnostics() {
        return {
          title: "Trae",
          url: "https://trae.local/app",
          selectorDiagnostics: {
            composer: [{ selector: "textarea", count: 1, matches: [{ tagName: "textarea" }] }]
          },
          genericCandidates: {
            composer: [{ tagName: "textarea" }],
            button: [{ tagName: "button" }]
          }
        };
      },
      async captureResponseSnapshot() {
        return [];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const diagnostics = await driver.getDiagnostics();
  assert.equal(diagnostics.ready, false);
  assert.equal(diagnostics.target.title, "Trae");
  assert.equal(diagnostics.diagnostics.selectorDiagnostics.composer[0].count, 1);
  assert.equal(diagnostics.diagnostics.genericCandidates.button[0].tagName, "button");
});

test("prepareSession clicks Trae new chat and marks the session as prepared", async () => {
  const driver = createTraeAutomationDriver({
    activitySelectors: [],
    postActionDelayMs: 0,
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true
        };
      },
      async captureResponseSnapshot() {
        return [];
      },
      async prepareSession() {
        return {
          clicked: true,
          trigger: "new_chat"
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const prepared = await driver.prepareSession({
    sessionId: "session-new-chat"
  });

  assert.equal(prepared.status, "ok");
  assert.equal(prepared.prepared, true);
  assert.equal(prepared.sessionId, "session-new-chat");
  assert.equal(prepared.preparation.trigger, "new_chat");
  assert.equal(driver.getSnapshot().preparedSessionCount, 1);
});

test("dispatchRequest collects incremental DOM updates until the response becomes idle", async () => {
  const observed = [];
  let captureCallCount = 0;

  const driver = createTraeAutomationDriver({
    activitySelectors: [],
    responsePollIntervalMs: 1,
    responseIdleMs: 2,
    responseTimeoutMs: 50,
    postActionDelayMs: 0,
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true
        };
      },
      async captureResponseSnapshot() {
        captureCallCount += 1;
        if (captureCallCount === 1) {
          return [];
        }
        if (captureCallCount === 2) {
          return [{ text: "Hello" }];
        }
        return [{ text: "Hello world" }];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const dispatched = driver.dispatchRequest({
    channel: "trae:conversation:stream",
    body: {
      sessionId: "session-1",
      content: "hello"
    },
    onEvent(event) {
      observed.push(event.type);
    }
  });

  const result = await dispatched.response;
  assert.equal(result.status, "ok");
  assert.equal(result.response.text, "Hello world");
  assert.deepEqual(result.chunks, ["Hello", " world"]);
  assert.deepEqual(observed, ["replace", "delta", "done"]);
});

test("dispatchRequest falls back to activity snapshots when final response selectors stay empty", async () => {
  const observed = [];
  let activityCaptureCount = 0;

  const driver = createTraeAutomationDriver({
    responsePollIntervalMs: 1,
    responseIdleMs: 2,
    responseTimeoutMs: 10,
    postActionDelayMs: 0,
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true
        };
      },
      async captureResponseSnapshot(_session, config, options = {}) {
        if (Array.isArray(options.selectors) && options.selectors.join(",") === config.activitySelectors.join(",")) {
          activityCaptureCount += 1;
          if (activityCaptureCount === 1) {
            return [];
          }
          return [{ text: "10:25 Richard Z hello Builder 任务完成 task complete" }];
        }
        return [];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const dispatched = driver.dispatchRequest({
    channel: "trae:conversation:stream",
    body: {
      sessionId: "session-activity",
      content: "hello"
    },
    onEvent(event) {
      observed.push(event.type);
    }
  });

  const result = await dispatched.response;
  assert.equal(result.status, "ok");
  assert.equal(result.response.text, "task complete");
  assert.ok(activityCaptureCount >= 2);
  assert.deepEqual(observed, ["replace", "done"]);
});

test("dispatchRequest keeps waiting for terminal activity when final selectors only expose a partial reply", async () => {
  let finalCaptureCount = 0;
  let activityCaptureCount = 0;

  const driver = createTraeAutomationDriver({
    responsePollIntervalMs: 1,
    responseIdleMs: 2,
    responseTimeoutMs: 30,
    postActionDelayMs: 0,
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true
        };
      },
      async captureResponseSnapshot(_session, config, options = {}) {
        if (Array.isArray(options.selectors) && options.selectors.join(",") === config.activitySelectors.join(",")) {
          activityCaptureCount += 1;
          if (activityCaptureCount <= 2) {
            return [{ text: "10:25 Richard Z prompt Builder 正在分析问题..." }];
          }
          return [{ text: "10:25 Richard Z prompt Builder 任务完成 Project README.md found" }];
        }

        finalCaptureCount += 1;
        if (finalCaptureCount === 1) {
          return [];
        }
        return [{ text: "Project" }];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const dispatched = driver.dispatchRequest({
    body: {
      sessionId: "session-partial",
      content: "prompt"
    }
  });

  const result = await dispatched.response;
  assert.equal(result.status, "ok");
  assert.equal(result.response.text, "Project README.md found");
  assert.deepEqual(
    result.events.map((event) => (event.type === "done" ? event.type : `${event.type}:${event.data}`)),
    ["replace:Project", "delta: README.md found", "done"]
  );
});

test("dispatchRequest waits for a fresh conversation before capturing the baseline for a new session", async () => {
  let responseCaptureCount = 0;

  const driver = createTraeAutomationDriver({
    activitySelectors: [],
    newChatSelectors: ["button.new-chat"],
    responsePollIntervalMs: 1,
    responseIdleMs: 2,
    responseTimeoutMs: 30,
    sessionPrepareTimeoutMs: 100,
    sessionPrepareStablePolls: 2,
    postActionDelayMs: 0,
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => ({
      async close() {}
    }),
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true
        };
      },
      async captureResponseSnapshot() {
        responseCaptureCount += 1;
        if (responseCaptureCount <= 2) {
          return [{ text: "old reply" }];
        }
        if (responseCaptureCount <= 4) {
          return [];
        }
        return [{ text: "new reply" }];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt() {
        return {
          ok: true
        };
      }
    }
  });

  const dispatched = driver.dispatchRequest({
    body: {
      sessionId: "session-fresh",
      content: "prompt"
    }
  });

  const result = await dispatched.response;
  assert.equal(result.status, "ok");
  assert.equal(result.response.text, "new reply");
  assert.deepEqual(
    result.events.map((event) => (event.type === "done" ? event.type : `${event.type}:${event.data}`)),
    ["replace:new reply", "done"]
  );
});

test("dispatchRequest serializes browser operations against a single Trae window", async () => {
  let connectCount = 0;
  const submitOrder = [];
  let releaseFirstResponse;
  const firstResponseGate = new Promise((resolve) => {
    releaseFirstResponse = resolve;
  });

  const driver = createTraeAutomationDriver({
    activitySelectors: [],
    responsePollIntervalMs: 1,
    responseIdleMs: 2,
    responseTimeoutMs: 100,
    postActionDelayMs: 0,
    discoverTarget: async () => createDiscoveryResult(),
    connectToTarget: async () => {
      connectCount += 1;
      return {
        id: connectCount,
        baselineReturned: false,
        afterSubmit: false,
        async close() {}
      };
    },
    domAdapter: {
      async inspectReadiness() {
        return {
          ready: true
        };
      },
      async captureResponseSnapshot(session) {
        if (!session.baselineReturned) {
          session.baselineReturned = true;
          return [];
        }
        if (session.id === 1 && !session.afterSubmit) {
          session.afterSubmit = true;
          await firstResponseGate;
          return [{ text: "First response" }];
        }
        return [{ text: session.id === 1 ? "First response" : "Second response" }];
      },
      async prepareSession() {
        return {
          clicked: true
        };
      },
      async submitPrompt(session) {
        submitOrder.push(session.id);
        return {
          ok: true
        };
      }
    }
  });

  const first = driver.dispatchRequest({
    body: {
      sessionId: "s-1",
      content: "first"
    }
  });
  const second = driver.dispatchRequest({
    body: {
      sessionId: "s-2",
      content: "second"
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(connectCount, 1);
  assert.deepEqual(submitOrder, [1]);

  releaseFirstResponse();

  const firstResult = await first.response;
  const secondResult = await second.response;
  assert.equal(firstResult.response.text, "First response");
  assert.equal(secondResult.response.text, "Second response");
  assert.deepEqual(submitOrder, [1, 2]);
});
