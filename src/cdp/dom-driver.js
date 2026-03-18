const { randomUUID } = require("node:crypto");
const { createCDPSession } = require("./client");
const { discoverTraeTarget } = require("./discovery");
const { TraeAutomationError, normalizeAutomationError } = require("./errors");
const {
  buildCaptureExpression,
  buildDiagnosticsExpression,
  buildPrepareInputExpression,
  buildPrepareSessionExpression,
  buildReadinessExpression,
  buildSubmitExpression,
  buildTriggerSubmitExpression
} = require("./browser-dom");

const DEFAULT_COMPOSER_SELECTORS = [".chat-input-v2-input-box-editable", "textarea", "[contenteditable='true']", "input[type='text']"];
const DEFAULT_SEND_BUTTON_SELECTORS = [
  "button.chat-input-v2-send-button",
  "button[data-testid*='send']",
  "button[aria-label*='Send']",
  "button[type='submit']"
];
const DEFAULT_RESPONSE_SELECTORS = [
  ".assistant-chat-turn-content",
  ".agent-plan-items.assistant-chat-turn-element",
  ".icd-open-folder-card-desc",
  "[data-message-author-role='assistant']",
  "[data-testid*='assistant']",
  "[data-role='assistant']",
  "[data-author='assistant']",
  ".assistant"
];
const DEFAULT_ACTIVITY_SELECTORS = [".chat-content-container", ".chat-list-wrapper"];
const DEFAULT_NEW_CHAT_SELECTORS = ["a.codicon-icube-NewChat"];
const DEFAULT_SUBMIT_MODE = String(process.env.TRAE_SEND_TRIGGER || "button").trim().toLowerCase() || "button";
const DEFAULT_RESPONSE_POLL_INTERVAL_MS = Number(process.env.TRAE_RESPONSE_POLL_INTERVAL_MS || 350);
const DEFAULT_RESPONSE_IDLE_MS = Number(process.env.TRAE_RESPONSE_IDLE_MS || 1200);
const DEFAULT_RESPONSE_TIMEOUT_MS = Number(process.env.TRAE_RESPONSE_TIMEOUT_MS || 30000);
const DEFAULT_POST_ACTION_DELAY_MS = Number(process.env.TRAE_POST_ACTION_DELAY_MS || 350);
const DEFAULT_SESSION_PREPARE_TIMEOUT_MS = Number(process.env.TRAE_SESSION_PREPARE_TIMEOUT_MS || 5000);
const DEFAULT_SESSION_PREPARE_STABLE_POLLS = Number(process.env.TRAE_SESSION_PREPARE_STABLE_POLLS || 2);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseSelectorList(value, fallbackSelectors, options = {}) {
  if (Array.isArray(value)) {
    const parsedArray = value.map((item) => String(item).trim()).filter(Boolean);
    if (parsedArray.length > 0 || options.allowExplicitEmptyArray) {
      return parsedArray;
    }
    return [...fallbackSelectors];
  }

  const parsed = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallbackSelectors];
}

function buildDriverConfig(options = {}) {
  return {
    discovery: {
      host: options.host,
      port: options.port,
      timeoutMs: options.discoveryTimeoutMs,
      titleContains: options.titleContains || process.env.TRAE_CDP_TARGET_TITLE_CONTAINS,
      urlContains: options.urlContains || process.env.TRAE_CDP_TARGET_URL_CONTAINS,
      targetType: options.targetType || process.env.TRAE_CDP_TARGET_TYPE
    },
    composerSelectors: parseSelectorList(options.composerSelectors || process.env.TRAE_COMPOSER_SELECTORS, DEFAULT_COMPOSER_SELECTORS),
    sendButtonSelectors: parseSelectorList(
      options.sendButtonSelectors || process.env.TRAE_SEND_BUTTON_SELECTORS,
      DEFAULT_SEND_BUTTON_SELECTORS
    ),
    responseSelectors: parseSelectorList(options.responseSelectors || process.env.TRAE_RESPONSE_SELECTORS, DEFAULT_RESPONSE_SELECTORS),
    activitySelectors: parseSelectorList(
      options.activitySelectors || process.env.TRAE_ACTIVITY_SELECTORS,
      DEFAULT_ACTIVITY_SELECTORS,
      {
        allowExplicitEmptyArray: Array.isArray(options.activitySelectors)
      }
    ),
    newChatSelectors: parseSelectorList(options.newChatSelectors || process.env.TRAE_NEW_CHAT_SELECTORS, DEFAULT_NEW_CHAT_SELECTORS),
    submitMode: String(options.submitMode || process.env.TRAE_SEND_TRIGGER || DEFAULT_SUBMIT_MODE).trim().toLowerCase() || "button",
    requireResponseSelector:
      options.requireResponseSelector === true || String(process.env.TRAE_REQUIRE_RESPONSE_SELECTOR || "0").trim() === "1",
    responsePollIntervalMs: Number(
      options.responsePollIntervalMs || process.env.TRAE_RESPONSE_POLL_INTERVAL_MS || DEFAULT_RESPONSE_POLL_INTERVAL_MS
    ),
    responseIdleMs: Number(options.responseIdleMs || process.env.TRAE_RESPONSE_IDLE_MS || DEFAULT_RESPONSE_IDLE_MS),
    responseTimeoutMs: Number(options.responseTimeoutMs || process.env.TRAE_RESPONSE_TIMEOUT_MS || DEFAULT_RESPONSE_TIMEOUT_MS),
    postActionDelayMs: Number(options.postActionDelayMs || process.env.TRAE_POST_ACTION_DELAY_MS || DEFAULT_POST_ACTION_DELAY_MS),
    sessionPrepareTimeoutMs: Number(
      options.sessionPrepareTimeoutMs || process.env.TRAE_SESSION_PREPARE_TIMEOUT_MS || DEFAULT_SESSION_PREPARE_TIMEOUT_MS
    ),
    sessionPrepareStablePolls: Number(
      options.sessionPrepareStablePolls || process.env.TRAE_SESSION_PREPARE_STABLE_POLLS || DEFAULT_SESSION_PREPARE_STABLE_POLLS
    ),
    commandTimeoutMs: Number(options.commandTimeoutMs || process.env.TRAE_CDP_COMMAND_TIMEOUT_MS || 5000)
  };
}

function createBrowserDomAdapter() {
  return {
    async inspectReadiness(session, config) {
      return session.evaluate(buildReadinessExpression(config));
    },
    async inspectDiagnostics(session, config, options = {}) {
      return session.evaluate(buildDiagnosticsExpression(config, options));
    },
    async captureResponseSnapshot(session, config, options = {}) {
      return session.evaluate(buildCaptureExpression(config, options));
    },
    async prepareSession(session, config) {
      if (!config.newChatSelectors.length) {
        return {
          clicked: false,
          skipped: true
        };
      }
      return session.evaluate(buildPrepareSessionExpression(config));
    },
    async submitPrompt(session, config, payload) {
      const prepared = await session.evaluate(buildPrepareInputExpression(config));
      if (!prepared || !prepared.ok) {
        return prepared;
      }

      const content = String(payload?.content || "");
      if (prepared.isContentEditable && typeof session.send === "function") {
        await session.send("Input.insertText", {
          text: content
        });
        const triggerResult = await session.evaluate(buildTriggerSubmitExpression(config));
        const composerText = String(triggerResult?.composerText || "").trim();
        if (triggerResult?.ok && composerText && !triggerResult?.sendButtonDisabled) {
          return triggerResult;
        }
        return session.evaluate(buildSubmitExpression(config, payload));
      }

      return session.evaluate(buildSubmitExpression(config, payload));
    }
  };
}

async function inspectAutomationTarget(options = {}) {
  const config = options.config || buildDriverConfig(options);
  const discoverTarget = typeof options.discoverTarget === "function" ? options.discoverTarget : discoverTraeTarget;
  const connectToTarget =
    typeof options.connectToTarget === "function"
      ? options.connectToTarget
      : async (target) =>
          createCDPSession({
            webSocketDebuggerUrl: target.webSocketDebuggerUrl,
            commandTimeoutMs: config.commandTimeoutMs
          });
  const domAdapter = options.domAdapter || createBrowserDomAdapter();
  let session = null;

  try {
    const discovery = await discoverTarget(config.discovery);
    session = await connectToTarget(discovery.target, config);
    const [readiness, diagnostics] = await Promise.all([
      domAdapter.inspectReadiness(session, config),
      typeof domAdapter.inspectDiagnostics === "function"
        ? domAdapter.inspectDiagnostics(session, config, options.inspectOptions || {})
        : Promise.resolve(null)
    ]);

    return {
      ready: Boolean(readiness && readiness.ready),
      mode: "cdp",
      target: discovery.target,
      version: discovery.version,
      selectors: {
        composerSelectors: config.composerSelectors,
        sendButtonSelectors: config.sendButtonSelectors,
        responseSelectors: config.responseSelectors,
        activitySelectors: config.activitySelectors,
        newChatSelectors: config.newChatSelectors
      },
      details: readiness || null,
      diagnostics: diagnostics || null
    };
  } catch (error) {
    return {
      ready: false,
      mode: "cdp",
      selectors: {
        composerSelectors: config.composerSelectors,
        sendButtonSelectors: config.sendButtonSelectors,
        responseSelectors: config.responseSelectors,
        activitySelectors: config.activitySelectors,
        newChatSelectors: config.newChatSelectors
      },
      error: normalizeAutomationError(error, "AUTOMATION_NOT_READY", "Trae automation is not ready"),
      diagnostics: null
    };
  } finally {
    if (session) {
      await session.close().catch(() => {});
    }
  }
}

function extractAutomationResponse(snapshot = [], baseline = []) {
  const currentTexts = Array.isArray(snapshot) ? snapshot.map((entry) => String(entry.text || "")).filter(Boolean) : [];
  const baselineTexts = Array.isArray(baseline) ? baseline.map((entry) => String(entry.text || "")).filter(Boolean) : [];

  if (currentTexts.length === 0) {
    return {
      text: "",
      source: "empty",
      snapshotCount: 0
    };
  }

  if (currentTexts.length > baselineTexts.length) {
    return {
      text: currentTexts.slice(baselineTexts.length).join("\n\n"),
      source: "new_nodes",
      snapshotCount: currentTexts.length
    };
  }

  const currentLast = currentTexts[currentTexts.length - 1];
  const baselineLast = baselineTexts[baselineTexts.length - 1] || "";
  if (baselineLast && currentLast.startsWith(baselineLast) && currentLast.length > baselineLast.length) {
    return {
      text: currentLast.slice(baselineLast.length),
      source: "last_node_growth",
      snapshotCount: currentTexts.length
    };
  }

  return {
    text: currentLast,
    source: "last_node",
    snapshotCount: currentTexts.length
  };
}

function normalizeComparableText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulActivityText(text, prompt) {
  const normalizedText = normalizeComparableText(text);
  if (!normalizedText) {
    return false;
  }

  const normalizedPrompt = normalizeComparableText(prompt);
  if (!normalizedPrompt) {
    return true;
  }

  if (normalizedText === normalizedPrompt) {
    return false;
  }

  return normalizeComparableText(normalizedText.split(normalizedPrompt).join(" ")).length > 0;
}

function sanitizeActivityText(text, prompt) {
  let sanitized = String(text || "");
  const normalizedPrompt = String(prompt || "").trim();

  if (normalizedPrompt) {
    const lastPromptIndex = sanitized.lastIndexOf(normalizedPrompt);
    if (lastPromptIndex >= 0) {
      sanitized = sanitized.slice(lastPromptIndex + normalizedPrompt.length);
    }
  }

  return sanitized
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/Builder/g, " ")
    .replace(/\u6b63\u5728\u5206\u6790\u95ee\u9898\.{0,3}/gu, " ")
    .replace(/\u601d\u8003\u4e2d\.{0,3}/gu, " ")
    .replace(/\u601d\u8003\u8fc7\u7a0b/gu, " ")
    .replace(/\u4efb\u52a1\u5b8c\u6210\s*\d+%/gu, " ")
    .replace(/\u4efb\u52a1\u5b8c\u6210/gu, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function buildActivityState(text, prompt) {
  const rawText = String(text || "");
  const sanitizedText = sanitizeActivityText(rawText, prompt);
  return {
    rawText,
    text: sanitizedText,
    meaningful: isMeaningfulActivityText(sanitizedText, ""),
    pending: /(?:\u6b63\u5728\u5206\u6790\u95ee\u9898|\u601d\u8003\u4e2d|\u601d\u8003\u8fc7\u7a0b)/u.test(rawText),
    terminal: /(?:\u4efb\u52a1\u5b8c\u6210|\u8bf7\u6c42\u5931\u8d25|\u5931\u8d25|\u5f02\u5e38\u6253\u65ad|\u9519\u8bef|error)/iu.test(rawText)
  };
}

function shouldPreferActivityText(finalText, activityState) {
  const normalizedFinal = normalizeComparableText(finalText);
  const normalizedActivity = normalizeComparableText(activityState?.text || "");
  if (!normalizedActivity) {
    return false;
  }
  if (!normalizedFinal) {
    return true;
  }
  if (normalizedActivity === normalizedFinal) {
    return false;
  }
  if (normalizedActivity.includes(normalizedFinal) && normalizedActivity.length > normalizedFinal.length) {
    return true;
  }
  return normalizedActivity.length >= normalizedFinal.length + 12;
}

function hasSnapshotContent(snapshot = []) {
  return Array.isArray(snapshot) && snapshot.some((entry) => normalizeComparableText(entry?.text || "").length > 0);
}

function buildSnapshotSignature(snapshot = []) {
  return (Array.isArray(snapshot) ? snapshot : [])
    .map((entry) => normalizeComparableText(entry?.text || ""))
    .filter(Boolean)
    .join("\n---\n");
}

async function waitForPreparedSession(options) {
  const {
    domAdapter,
    session,
    config,
    beforeResponseSnapshot,
    beforeActivitySnapshot,
    now
  } = options;
  const beforeResponseSignature = buildSnapshotSignature(beforeResponseSnapshot);
  const beforeActivitySignature = buildSnapshotSignature(beforeActivitySnapshot);
  let stablePolls = 0;
  let lastCombinedSignature = "";
  const startedAtMs = now();

  while (now() - startedAtMs < config.sessionPrepareTimeoutMs) {
    const responseSnapshot = await domAdapter.captureResponseSnapshot(session, config);
    const activitySnapshot =
      config.activitySelectors.length > 0
        ? await domAdapter.captureResponseSnapshot(session, config, {
            selectors: config.activitySelectors,
            allowHiddenText: true
          })
        : [];

    const responseSignature = buildSnapshotSignature(responseSnapshot);
    const activitySignature = buildSnapshotSignature(activitySnapshot);
    const combinedSignature = `${responseSignature}\n@@\n${activitySignature}`;
    const changed = responseSignature !== beforeResponseSignature || activitySignature !== beforeActivitySignature;

    if (changed) {
      if (combinedSignature === lastCombinedSignature) {
        stablePolls += 1;
      } else {
        stablePolls = 1;
        lastCombinedSignature = combinedSignature;
      }

      if (stablePolls >= config.sessionPrepareStablePolls) {
        return {
          responseSnapshot,
          activitySnapshot
        };
      }
    } else {
      stablePolls = 0;
      lastCombinedSignature = combinedSignature;
    }

    await sleep(config.responsePollIntervalMs);
  }

  throw new TraeAutomationError("AUTOMATION_NEW_CHAT_TIMEOUT", "Timed out while waiting for Trae to switch to a fresh conversation", {
    sessionPrepareTimeoutMs: config.sessionPrepareTimeoutMs,
    beforeResponseSignature,
    beforeActivitySignature
  });
}

async function collectAutomationResponse(options) {
  const {
    domAdapter,
    session,
    config,
    baselineSnapshot,
    baselineActivitySnapshot,
    onEvent,
    prompt,
    requestId,
    channel,
    now
  } = options;
  const startedAtMs = now();
  const events = [];
  const chunks = [];
  let lastText = "";
  let lastFinalText = "";
  let lastActivityText = "";
  let lastActivitySource = "activity";
  let lastActivitySnapshotCount = 0;
  let lastResponseText = "";
  let lastResponseCanFinish = false;
  let lastChangeAtMs = null;

  while (now() - startedAtMs < config.responseTimeoutMs) {
    const snapshot = await domAdapter.captureResponseSnapshot(session, config);
    const extracted = extractAutomationResponse(snapshot, baselineSnapshot);
    const nextFinalText = extracted.text || "";
    if (nextFinalText) {
      lastFinalText = nextFinalText;
    }

    let activityState = {
      rawText: "",
      text: "",
      meaningful: false,
      pending: false,
      terminal: false
    };
    if (config.activitySelectors.length > 0) {
      const activitySnapshot = await domAdapter.captureResponseSnapshot(session, config, {
        selectors: config.activitySelectors,
        allowHiddenText: true
      });
      const extractedActivity = extractAutomationResponse(activitySnapshot, baselineActivitySnapshot);
      activityState = buildActivityState(extractedActivity.text, prompt);
      if (activityState.meaningful) {
        lastActivityText = activityState.text;
        lastActivitySource = `activity_${extractedActivity.source}`;
        lastActivitySnapshotCount = extractedActivity.snapshotCount;
      }
    }

    let candidateText = lastFinalText || "";
    let candidateSource = extracted.source;
    let candidateSnapshotCount = extracted.snapshotCount;
    let candidateCanFinish = Boolean(lastFinalText) && (!activityState.meaningful || activityState.terminal);

    if (activityState.meaningful && shouldPreferActivityText(lastFinalText, activityState) && (!activityState.pending || activityState.terminal)) {
      candidateText = activityState.text;
      candidateSource = lastActivitySource;
      candidateSnapshotCount = lastActivitySnapshotCount;
      candidateCanFinish = activityState.terminal;
    }

    if (candidateText && candidateText !== lastText) {
      const isAppend = Boolean(lastText) && candidateText.startsWith(lastText);
      const event = {
        type: isAppend ? "delta" : "replace",
        data: isAppend ? candidateText.slice(lastText.length) : candidateText,
        source: candidateSource,
        snapshotCount: candidateSnapshotCount,
        requestId,
        channel
      };
      lastText = candidateText;
      if (event.data) {
        chunks.push(event.data);
      }
      events.push(event);
      if (typeof onEvent === "function") {
        try {
          onEvent(event);
        } catch (error) {
          events.push({
            type: "observer_error",
            requestId,
            channel,
            error: normalizeAutomationError(error, "AUTOMATION_EVENT_OBSERVER_ERROR")
          });
        }
      }
    }

    if (candidateText) {
      if (candidateText !== lastResponseText || candidateCanFinish !== lastResponseCanFinish || lastChangeAtMs === null) {
        lastResponseText = candidateText;
        lastResponseCanFinish = candidateCanFinish;
        lastChangeAtMs = now();
      }
    }

    if (lastResponseCanFinish && lastChangeAtMs !== null && now() - lastChangeAtMs >= config.responseIdleMs) {
      break;
    }

    await sleep(config.responsePollIntervalMs);
  }

  const responseText = lastResponseText || lastFinalText || lastActivityText || lastText;
  if (!responseText) {
    throw new TraeAutomationError("AUTOMATION_RESPONSE_TIMEOUT", "Timed out waiting for a DOM response from Trae", {
      responseTimeoutMs: config.responseTimeoutMs
    });
  }

  if (!lastResponseText && !lastFinalText && lastActivityText && lastText !== lastActivityText) {
    const fallbackEvent = {
      type: "replace",
      data: lastActivityText,
      source: lastActivitySource,
      snapshotCount: lastActivitySnapshotCount,
      requestId,
      channel
    };
    lastText = lastActivityText;
    chunks.push(lastActivityText);
    events.push(fallbackEvent);
    if (typeof onEvent === "function") {
      try {
        onEvent(fallbackEvent);
      } catch (error) {
        events.push({
          type: "observer_error",
          requestId,
          channel,
          error: normalizeAutomationError(error, "AUTOMATION_EVENT_OBSERVER_ERROR")
        });
      }
    }
  }

  const doneEvent = {
    type: "done",
    requestId,
    channel
  };
  events.push(doneEvent);
  if (typeof onEvent === "function") {
    try {
      onEvent(doneEvent);
    } catch (error) {
      events.push({
        type: "observer_error",
        requestId,
        channel,
        error: normalizeAutomationError(error, "AUTOMATION_EVENT_OBSERVER_ERROR")
      });
    }
  }

  return {
    events,
    chunks,
    response: {
      text: responseText
    }
  };
}

function createTraeAutomationDriver(options = {}) {
  const config = buildDriverConfig(options);
  const discoverTarget = typeof options.discoverTarget === "function" ? options.discoverTarget : discoverTraeTarget;
  const connectToTarget =
    typeof options.connectToTarget === "function"
      ? options.connectToTarget
      : async (target) =>
          createCDPSession({
            webSocketDebuggerUrl: target.webSocketDebuggerUrl,
            commandTimeoutMs: config.commandTimeoutMs
          });
  const domAdapter = options.domAdapter || createBrowserDomAdapter();
  const now = typeof options.now === "function" ? options.now : Date.now;
  const preparedSessions = new Set();
  let queuedOperations = Promise.resolve();
  let queuedRequestCount = 0;
  let lastReadiness = {
    ready: false
  };

  async function prepareConversationSession(session, discovery, requestId, channel, sessionId = null) {
    const beforePrepareSnapshot = await domAdapter.captureResponseSnapshot(session, config);
    const beforePrepareActivitySnapshot =
      config.activitySelectors.length > 0
        ? await domAdapter.captureResponseSnapshot(session, config, {
            selectors: config.activitySelectors,
            allowHiddenText: true
          })
        : [];
    const preparation = await domAdapter.prepareSession(session, config, {
      sessionId
    });
    if (!preparation || !preparation.clicked) {
      throw new TraeAutomationError("AUTOMATION_NEW_CHAT_FAILED", "Failed to switch Trae into a fresh conversation", {
        preparation: preparation || {}
      });
    }

    if (sessionId) {
      preparedSessions.add(sessionId);
    }

    if (config.postActionDelayMs > 0) {
      await sleep(config.postActionDelayMs);
    }

    let baselineSnapshot = null;
    let baselineActivitySnapshot = null;
    if (hasSnapshotContent(beforePrepareSnapshot) || hasSnapshotContent(beforePrepareActivitySnapshot)) {
      try {
        const preparedBaseline = await waitForPreparedSession({
          domAdapter,
          session,
          config,
          beforeResponseSnapshot: beforePrepareSnapshot,
          beforeActivitySnapshot: beforePrepareActivitySnapshot,
          now
        });
        baselineSnapshot = preparedBaseline.responseSnapshot;
        baselineActivitySnapshot = preparedBaseline.activitySnapshot;
      } catch (error) {
        if (!(error instanceof TraeAutomationError) || error.code !== "AUTOMATION_NEW_CHAT_TIMEOUT") {
          throw error;
        }
      }
    }

    return {
      status: "ok",
      requestId,
      channel,
      prepared: true,
      sessionId,
      preparation,
      baselineSnapshot,
      baselineActivitySnapshot,
      target: {
        id: discovery.target.id,
        title: discovery.target.title,
        url: discovery.target.url
      }
    };
  }

  async function inspectReadyState() {
    const inspected = await inspectAutomationTarget({
      config,
      discoverTarget,
      connectToTarget,
      domAdapter
    });
    if (inspected.ready) {
      return inspected;
    }
    if (inspected.details && inspected.details.ready === false) {
      return {
        ...inspected,
        error: {
          code: "AUTOMATION_SELECTOR_NOT_READY",
          message: "The Trae window was found, but the DOM selectors are not ready",
          details: inspected.details
        }
      };
    }
    return inspected;
  }

  async function runAutomationRequest(requestId, payload = {}) {
    const startedAt = new Date().toISOString();
    let session = null;
    try {
      const discovery = await discoverTarget(config.discovery);
      session = await connectToTarget(discovery.target, config);
      const readiness = await domAdapter.inspectReadiness(session, config);
      if (!readiness || !readiness.ready) {
        throw new TraeAutomationError("AUTOMATION_SELECTOR_NOT_READY", "The Trae window is missing the configured selectors", {
          readiness
        });
      }

      const sessionId = payload.body?.sessionId || null;
      let baselineSnapshot = null;
      let baselineActivitySnapshot = null;
      if (sessionId && config.newChatSelectors.length > 0 && !preparedSessions.has(sessionId)) {
        const preparation = await prepareConversationSession(
          session,
          discovery,
          requestId,
          payload.channel || "trae:conversation:send",
          sessionId
        );
        baselineSnapshot = preparation.baselineSnapshot;
        baselineActivitySnapshot = preparation.baselineActivitySnapshot;
      }

      if (!baselineSnapshot) {
        baselineSnapshot = await domAdapter.captureResponseSnapshot(session, config);
      }
      if (!baselineActivitySnapshot) {
        baselineActivitySnapshot =
          config.activitySelectors.length > 0
            ? await domAdapter.captureResponseSnapshot(session, config, {
                selectors: config.activitySelectors,
                allowHiddenText: true
              })
            : [];
      }
      const submitResult = await domAdapter.submitPrompt(session, config, payload.body || {});
      if (!submitResult || !submitResult.ok) {
        throw new TraeAutomationError("AUTOMATION_SUBMIT_FAILED", "Failed to submit text through the Trae window", {
          submitResult: submitResult || {}
        });
      }

      if (config.postActionDelayMs > 0) {
        await sleep(config.postActionDelayMs);
      }

      const collected = await collectAutomationResponse({
        domAdapter,
        session,
        config,
        baselineSnapshot,
        baselineActivitySnapshot,
        onEvent: payload.onEvent,
        prompt: String(payload.body?.content || ""),
        requestId,
        channel: payload.channel || "trae:conversation:send",
        now
      });

      return {
        status: "ok",
        requestId,
        channel: payload.channel || "trae:conversation:send",
        startedAt,
        finishedAt: new Date().toISOString(),
        events: collected.events,
        chunks: collected.chunks,
        response: collected.response,
        target: {
          id: discovery.target.id,
          title: discovery.target.title,
          url: discovery.target.url
        }
      };
    } catch (error) {
      throw normalizeAutomationError(error, "AUTOMATION_REQUEST_FAILED", "Trae automation request failed");
    } finally {
      if (session) {
        await session.close().catch(() => {});
      }
    }
  }

  function enqueueOperation(operation) {
    queuedRequestCount += 1;
    const queued = queuedOperations.then(operation, operation);
    queuedOperations = queued.catch(() => {});
    return queued.finally(() => {
      queuedRequestCount = Math.max(0, queuedRequestCount - 1);
    });
  }

  return {
    async getReadiness() {
      lastReadiness = await inspectReadyState();
      return lastReadiness;
    },
    async getDiagnostics(options = {}) {
      const diagnostics = await inspectAutomationTarget({
        config,
        discoverTarget,
        connectToTarget,
        domAdapter,
        inspectOptions: options
      });
      lastReadiness = diagnostics;
      return diagnostics;
    },
    normalizeError(error, fallbackCode = "AUTOMATION_ERROR") {
      return normalizeAutomationError(error, fallbackCode);
    },
    dispatchRequest(payload = {}) {
      const requestId = payload.requestId || randomUUID();
      return {
        requestId,
        response: enqueueOperation(() => runAutomationRequest(requestId, payload))
      };
    },
    prepareSession(payload = {}) {
      const requestId = payload.requestId || randomUUID();
      return enqueueOperation(async () => {
        const startedAt = new Date().toISOString();
        let session = null;
        try {
          const discovery = await discoverTarget(config.discovery);
          session = await connectToTarget(discovery.target, config);
          const readiness = await domAdapter.inspectReadiness(session, config);
          if (!readiness || !readiness.ready) {
            throw new TraeAutomationError("AUTOMATION_SELECTOR_NOT_READY", "The Trae window is missing the configured selectors", {
              readiness
            });
          }

          const prepared = await prepareConversationSession(
            session,
            discovery,
            requestId,
            payload.channel || "trae:session:prepare",
            payload.sessionId || null
          );
          const { baselineSnapshot: _baselineSnapshot, baselineActivitySnapshot: _baselineActivitySnapshot, ...preparedResult } = prepared;

          return {
            ...preparedResult,
            startedAt,
            finishedAt: new Date().toISOString()
          };
        } catch (error) {
          throw normalizeAutomationError(error, "AUTOMATION_PREPARE_FAILED", "Trae automation prepare session failed");
        } finally {
          if (session) {
            await session.close().catch(() => {});
          }
        }
      });
    },
    getSnapshot() {
      return {
        mode: "cdp",
        queuedRequestCount,
        preparedSessionCount: preparedSessions.size,
        lastReadiness
      };
    }
  };
}

module.exports = {
  DEFAULT_COMPOSER_SELECTORS,
  DEFAULT_SEND_BUTTON_SELECTORS,
  DEFAULT_RESPONSE_SELECTORS,
  buildDriverConfig,
  createBrowserDomAdapter,
  inspectAutomationTarget,
  createTraeAutomationDriver,
  extractAutomationResponse
};
