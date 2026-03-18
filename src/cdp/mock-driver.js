const { randomUUID } = require("node:crypto");
const { normalizeAutomationError } = require("./errors");

function createMockAutomationDriver(options = {}) {
  const latencyMs = Number(options.latencyMs || process.env.TRAE_MOCK_LATENCY_MS || 80);
  const mode = String(options.mode || "mock");
  const preparedSessions = [];

  return {
    async getReadiness() {
      return {
        ready: true,
        mode,
        target: {
          id: "mock-target",
          title: "Mock Trae Window",
          url: "mock://trae"
        },
        selectors: {
          composerSelectors: ["mock://composer"],
          responseSelectors: ["mock://response"],
          activitySelectors: ["mock://activity"],
          sendButtonSelectors: ["mock://send"]
        }
      };
    },
    async getDiagnostics() {
      return {
        ready: true,
        mode,
        target: {
          id: "mock-target",
          title: "Mock Trae Window",
          url: "mock://trae"
        },
        selectors: {
          composerSelectors: ["mock://composer"],
          responseSelectors: ["mock://response"],
          activitySelectors: ["mock://activity"],
          sendButtonSelectors: ["mock://send"],
          newChatSelectors: ["mock://new-chat"]
        },
        details: {
          composerFound: true,
          sendButtonFound: true,
          responseSelectorFound: true
        },
        diagnostics: {
          title: "Mock Trae Window",
          url: "mock://trae",
          readyState: "complete",
          selectorDiagnostics: {
            composer: [{ selector: "mock://composer", count: 1, matches: [{ tagName: "textarea", textPreview: "" }] }],
            sendButton: [{ selector: "mock://send", count: 1, matches: [{ tagName: "button", textPreview: "Send" }] }],
            response: [{ selector: "mock://response", count: 1, matches: [{ tagName: "div", textPreview: "Mock reply" }] }],
            activity: [{ selector: "mock://activity", count: 1, matches: [{ tagName: "div", textPreview: "Mock activity" }] }],
            newChat: [{ selector: "mock://new-chat", count: 1, matches: [{ tagName: "button", textPreview: "New chat" }] }]
          },
          genericCandidates: {
            composer: [{ tagName: "textarea", textPreview: "" }],
            button: [{ tagName: "button", textPreview: "Send" }]
          }
        }
      };
    },
    normalizeError(error, fallbackCode = "AUTOMATION_ERROR") {
      return normalizeAutomationError(error, fallbackCode);
    },
    async prepareSession(payload = {}) {
      const requestId = payload.requestId || randomUUID();
      const sessionId = payload.sessionId || null;
      if (sessionId) {
        preparedSessions.push(sessionId);
      }
      return {
        status: "ok",
        requestId,
        channel: payload.channel || "trae:session:prepare",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        prepared: true,
        sessionId,
        preparation: {
          clicked: true,
          trigger: "new_chat"
        },
        target: {
          id: "mock-target",
          title: "Mock Trae Window",
          url: "mock://trae"
        }
      };
    },
    dispatchRequest(payload = {}) {
      const requestId = payload.requestId || randomUUID();
      const prompt = typeof payload.body?.content === "string" ? payload.body.content.trim() : "";
      const text = prompt ? `Mock reply: ${prompt}` : "Mock reply: request received";
      const channel = payload.channel || "trae:conversation:send";
      const midpoint = Math.max(1, Math.ceil(text.length / 2));
      const response = new Promise((resolve) => {
        const events = [];
        const chunks = [];

        const emit = (event) => {
          events.push(event);
          if (typeof event.data === "string") {
            chunks.push(event.data);
          }
          if (typeof payload.onEvent === "function") {
            payload.onEvent(event);
          }
        };

        if (channel === "trae:conversation:stream") {
          setTimeout(() => {
            emit({ type: "delta", data: text.slice(0, midpoint) });
          }, latencyMs);
          setTimeout(() => {
            emit({ type: "delta", data: text.slice(midpoint) });
          }, latencyMs * 2);
          setTimeout(() => {
            emit({ type: "done" });
            resolve({
              status: "ok",
              requestId,
              channel,
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              events,
              chunks,
              response: {
                text
              }
            });
          }, latencyMs * 3);
          return;
        }

        setTimeout(() => {
          emit({ type: "delta", data: text });
          emit({ type: "done" });
          resolve({
            status: "ok",
            requestId,
            channel,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            events,
            chunks,
            response: {
              text
            }
          });
        }, latencyMs);
      });

      return {
        requestId,
        response
      };
    },
    getSnapshot() {
      return {
        mode,
        latencyMs,
        preparedSessions
      };
    }
  };
}

module.exports = {
  createMockAutomationDriver
};
