const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { createTraeAutomationDriver } = require("../cdp/dom-driver");
const { normalizeAutomationError } = require("../cdp/errors");
const { getChatPageHtml } = require("./chat-ui");
const { buildOpenApiDocument, buildOpenApiYaml } = require("./openapi");

const MAX_BODY_BYTES = Number(process.env.TRAE_HTTP_MAX_BODY_BYTES || 1024 * 1024);
const DEFAULT_AUTH_HEADER = "authorization";
const DEFAULT_RATE_LIMIT_WINDOW_MS = Number(process.env.TRAE_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = Number(process.env.TRAE_RATE_LIMIT_MAX_REQUESTS || 60);
const DEFAULT_ALLOWED_ORIGINS = String(process.env.TRAE_ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const REDACTED_VALUE = "***";
const SENSITIVE_KEYWORDS = ["token", "authorization", "password", "secret", "apikey", "api_key", "credential"];

class ApiError extends Error {
  constructor(code, message, statusCode, details = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function writeHtml(res, statusCode, html) {
  res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function writeText(res, statusCode, contentType, text) {
  res.writeHead(statusCode, { "content-type": `${contentType}; charset=utf-8` });
  res.end(text);
}

function writeApiSuccess(res, statusCode, data, meta = {}) {
  writeJson(res, statusCode, {
    success: true,
    code: "OK",
    data,
    meta: {
      requestId: meta.requestId,
      idempotencyKey: meta.idempotencyKey || null,
      replayed: meta.replayed === true
    }
  });
}

function writeApiError(res, error, meta = {}) {
  const normalizedError =
    error instanceof ApiError
      ? error
      : new ApiError(error.code || "INTERNAL_ERROR", error.message || "Internal server error", 500, error.details || {});
  writeJson(res, normalizedError.statusCode, {
    success: false,
    code: normalizedError.code,
    message: normalizedError.message,
    details: normalizedError.details || {},
    meta: {
      requestId: meta.requestId,
      idempotencyKey: meta.idempotencyKey || null
    }
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ApiError("PAYLOAD_TOO_LARGE", "Request body exceeded the configured size limit", 413, { maxBytes: MAX_BODY_BYTES }));
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      if (!body.trim()) {
        req.__parsedJsonBody = {};
        resolve(req.__parsedJsonBody);
        return;
      }
      try {
        req.__parsedJsonBody = JSON.parse(body);
        resolve(req.__parsedJsonBody);
      } catch (error) {
        reject(new ApiError("INVALID_JSON", "Request body is not valid JSON", 400));
      }
    });
    req.on("error", (error) => {
      reject(new ApiError("READ_BODY_FAILED", "Failed to read request body", 400, { message: error.message }));
    });
  });
}

function parseSessionIdFromPath(pathname, pattern) {
  const matched = pathname.match(pattern);
  if (!matched) {
    return null;
  }
  return decodeURIComponent(matched[1]);
}

function normalizeLoopbackHost(value) {
  const host = String(value || "").trim().toLowerCase();
  if (!host || host === "localhost") {
    return "127.0.0.1";
  }
  return host;
}

function isLoopbackAddress(address) {
  if (!address) {
    return false;
  }
  const normalized = String(address).toLowerCase();
  if (normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    return normalized.slice("::ffff:".length) === "127.0.0.1";
  }
  return false;
}

function isAllowedListenHost(host) {
  const normalized = normalizeLoopbackHost(host);
  return normalized === "127.0.0.1" || normalized === "::1";
}

function buildAllowedOrigins(options = {}) {
  if (Array.isArray(options.allowedOrigins)) {
    return options.allowedOrigins.map((item) => String(item).trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function resolveClientAddress(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "";
}

function isSensitiveKey(key) {
  const normalized = String(key || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function sanitizeSensitiveData(value, key = "") {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSensitiveData(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [nestedKey, sanitizeSensitiveData(nestedValue, nestedKey)])
    );
  }
  return value;
}

function parseBearerToken(value) {
  if (!value || typeof value !== "string") {
    return null;
  }
  const matched = value.match(/^Bearer\s+(.+)$/i);
  if (!matched) {
    return null;
  }
  return matched[1].trim();
}

function resolveServerUrl(req) {
  const protocol = req.socket?.encrypted ? "https" : "http";
  const host = req.headers.host || "127.0.0.1:8787";
  return `${protocol}://${host}`;
}

function createGatewayServer(options = {}) {
  const automationDriver = options.automationDriver || createTraeAutomationDriver(options.automationOptions || {});
  const sessions = new Map();
  const idempotencyStore = new Map();
  const security = {
    authToken: options.authToken || process.env.TRAE_GATEWAY_TOKEN || "",
    authHeader: String(options.authHeader || process.env.TRAE_AUTH_HEADER || DEFAULT_AUTH_HEADER).toLowerCase(),
    allowedOrigins: buildAllowedOrigins(options),
    rateLimitWindowMs: Number(options.rateLimitWindowMs || DEFAULT_RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: Number(options.rateLimitMaxRequests || DEFAULT_RATE_LIMIT_MAX_REQUESTS),
    enableAuditLog: options.enableAuditLog !== false
  };
  const enableDebugEndpoints =
    options.enableDebugEndpoints === true || String(process.env.TRAE_ENABLE_DEBUG_ENDPOINTS || "0").trim() === "1";
  const rateLimitStore = new Map();
  const bootedAt = Date.now();
  const requestStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    inflightRequests: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    errorByCode: {},
    routeStats: {}
  };

  async function getAutomationState() {
    try {
      if (!automationDriver || typeof automationDriver.getReadiness !== "function") {
        return {
          ready: false,
          mode: "unconfigured",
          error: {
            code: "AUTOMATION_DRIVER_UNAVAILABLE",
            message: "Automation driver is not configured"
          }
        };
      }
      const readiness = await automationDriver.getReadiness();
      return {
        ...readiness,
        snapshot: typeof automationDriver.getSnapshot === "function" ? automationDriver.getSnapshot() : null
      };
    } catch (error) {
      return {
        ready: false,
        mode: "cdp",
        error: normalizeAutomationError(error, "AUTOMATION_NOT_READY", "Trae automation is not ready"),
        snapshot: typeof automationDriver?.getSnapshot === "function" ? automationDriver.getSnapshot() : null
      };
    }
  }

  function resolveMeta(req) {
    return {
      requestId: req.headers["x-request-id"] || randomUUID(),
      idempotencyKey: req.headers["idempotency-key"] || null
    };
  }

  function beginRequestStats() {
    requestStats.totalRequests += 1;
    requestStats.inflightRequests += 1;
  }

  function collectRouteStats(pathname) {
    if (!requestStats.routeStats[pathname]) {
      requestStats.routeStats[pathname] = {
        total: 0,
        failed: 0
      };
    }
    return requestStats.routeStats[pathname];
  }

  function completeRequestStats(entry) {
    requestStats.inflightRequests = Math.max(0, requestStats.inflightRequests - 1);
    requestStats.totalDurationMs += entry.durationMs;
    requestStats.maxDurationMs = Math.max(requestStats.maxDurationMs, entry.durationMs);
    const route = collectRouteStats(entry.pathname);
    route.total += 1;
    if (entry.statusCode >= 400) {
      requestStats.failedRequests += 1;
      route.failed += 1;
      const errorCode = entry.outcome || "UNKNOWN_ERROR";
      requestStats.errorByCode[errorCode] = (requestStats.errorByCode[errorCode] || 0) + 1;
      return;
    }
    requestStats.successfulRequests += 1;
  }

  function getRequestStatsSnapshot() {
    return {
      totalRequests: requestStats.totalRequests,
      successfulRequests: requestStats.successfulRequests,
      failedRequests: requestStats.failedRequests,
      inflightRequests: requestStats.inflightRequests,
      avgDurationMs: requestStats.totalRequests > 0 ? Math.round(requestStats.totalDurationMs / requestStats.totalRequests) : 0,
      maxDurationMs: requestStats.maxDurationMs,
      errorByCode: { ...requestStats.errorByCode },
      routeStats: Object.fromEntries(
        Object.entries(requestStats.routeStats).map(([pathname, value]) => [pathname, { total: value.total, failed: value.failed }])
      )
    };
  }

  function getIdempotencyEntry(method, pathname, idempotencyKey) {
    if (!idempotencyKey) {
      return null;
    }
    return idempotencyStore.get(`${method}:${pathname}:${idempotencyKey}`) || null;
  }

  function setIdempotencyEntry(method, pathname, idempotencyKey, entry) {
    if (!idempotencyKey) {
      return;
    }
    idempotencyStore.set(`${method}:${pathname}:${idempotencyKey}`, entry);
  }

  function requireSession(sessionId) {
    if (!sessions.has(sessionId)) {
      throw new ApiError("SESSION_NOT_FOUND", "Session was not found", 404, { sessionId });
    }
    return sessions.get(sessionId);
  }

  async function requireAutomationDriver() {
    if (!automationDriver || typeof automationDriver.dispatchRequest !== "function") {
      throw new ApiError("AUTOMATION_DRIVER_UNAVAILABLE", "Automation driver is unavailable", 503);
    }
    const automationState = await getAutomationState();
    if (!automationState.ready) {
      throw new ApiError("AUTOMATION_NOT_READY", "Trae automation is not ready", 503, automationState.error || {});
    }
    return {
      driver: automationDriver,
      automationState
    };
  }

  function authenticateRequest(req) {
    if (!security.authToken) {
      return { authenticated: false, required: false };
    }
    const headerValue = req.headers[security.authHeader];
    const bearerToken = parseBearerToken(typeof headerValue === "string" ? headerValue : "");
    const directToken = typeof req.headers["x-trae-token"] === "string" ? req.headers["x-trae-token"].trim() : "";
    const token = bearerToken || directToken;
    if (!token || token !== security.authToken) {
      throw new ApiError("UNAUTHORIZED", "Token is missing or invalid", 401);
    }
    return { authenticated: true, required: true };
  }

  function validateRequestSource(req) {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
    const referer = typeof req.headers.referer === "string" ? req.headers.referer.trim() : "";
    if (security.allowedOrigins.length === 0) {
      return { checked: false, origin, referer };
    }
    if (!origin && !referer) {
      return { checked: true, origin, referer };
    }
    const isOriginAllowed = origin ? security.allowedOrigins.includes(origin) : true;
    const isRefererAllowed = referer
      ? security.allowedOrigins.some((allowedOrigin) => referer.startsWith(`${allowedOrigin}/`) || referer === allowedOrigin)
      : true;
    if (!isOriginAllowed || !isRefererAllowed) {
      throw new ApiError("FORBIDDEN_ORIGIN", "Request origin is not allowed", 403, {
        origin: origin || null,
        referer: referer || null
      });
    }
    return { checked: true, origin, referer };
  }

  function enforceRateLimit(req) {
    if (!(security.rateLimitMaxRequests > 0) || !(security.rateLimitWindowMs > 0)) {
      return { checked: false };
    }
    const now = Date.now();
    const source = resolveClientAddress(req) || "unknown";
    const key = `${req.method || "UNKNOWN"}:${source}`;
    const bucket = rateLimitStore.get(key);
    if (!bucket || now - bucket.windowStart >= security.rateLimitWindowMs) {
      rateLimitStore.set(key, { windowStart: now, count: 1 });
      return { checked: true, source, count: 1 };
    }
    bucket.count += 1;
    if (bucket.count > security.rateLimitMaxRequests) {
      throw new ApiError("RATE_LIMITED", "Request rate limit exceeded", 429, {
        source,
        windowMs: security.rateLimitWindowMs,
        maxRequests: security.rateLimitMaxRequests
      });
    }
    return { checked: true, source, count: bucket.count };
  }

  function emitAuditLog(entry) {
    if (!security.enableAuditLog) {
      return;
    }
    console.log(
      JSON.stringify({
        event: "gateway_audit",
        ...entry
      })
    );
  }

  function emitRequestTrace(entry) {
    console.log(
      JSON.stringify({
        event: "gateway_request_trace",
        requestId: entry.requestId,
        method: entry.method,
        pathname: entry.pathname,
        statusCode: entry.statusCode,
        outcome: entry.outcome,
        durationMs: entry.durationMs,
        sourceIp: entry.sourceIp
      })
    );
  }

  async function buildRuntimeStatus() {
    const automation = await getAutomationState();
    return {
      service: "trae-cdp-http-bridge",
      uptimeMs: Date.now() - bootedAt,
      automation,
      hook: automation,
      metrics: getRequestStatsSnapshot()
    };
  }

  async function buildAutomationDiagnostics() {
    if (!automationDriver || typeof automationDriver.getDiagnostics !== "function") {
      return {
        ready: false,
        mode: "unconfigured",
        error: {
          code: "AUTOMATION_DIAGNOSTICS_UNAVAILABLE",
          message: "Automation diagnostics are unavailable"
        }
      };
    }

    try {
      return await automationDriver.getDiagnostics();
    } catch (error) {
      return {
        ready: false,
        error: normalizeAutomationError(error, "AUTOMATION_DIAGNOSTICS_FAILED", "Failed to collect automation diagnostics")
      };
    }
  }

  function buildAuditEntry(req, pathname, meta, startedAt, statusCode, outcome) {
    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;
    const rawBody = req.__parsedJsonBody || {};
    return {
      requestId: meta.requestId,
      idempotencyKey: meta.idempotencyKey || null,
      method: req.method,
      pathname,
      statusCode,
      outcome,
      durationMs,
      sourceIp: resolveClientAddress(req),
      headers: sanitizeSensitiveData(req.headers || {}),
      body: sanitizeSensitiveData(rawBody)
    };
  }

  function createSessionRecord(metadata = {}) {
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const session = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      status: "idle",
      metadata: sanitizeSensitiveData(metadata || {})
    };
    sessions.set(sessionId, session);
    return session;
  }

  function assertValidMessageBody(body) {
    if (typeof body.content !== "string" || !body.content.trim()) {
      throw new ApiError("INVALID_MESSAGE_CONTENT", "content must be a non-empty string", 400);
    }
    return body;
  }

  function resolveChatSession(body) {
    if (body.sessionId === undefined || body.sessionId === null) {
      return {
        session: createSessionRecord(body.sessionMetadata || {}),
        sessionCreated: true
      };
    }

    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      throw new ApiError("INVALID_SESSION_ID", "sessionId must be a non-empty string when provided", 400);
    }

    return {
      session: requireSession(body.sessionId.trim()),
      sessionCreated: false
    };
  }

  async function dispatchBlockingMessage(session, body) {
    const { driver } = await requireAutomationDriver();
    const dispatched = driver.dispatchRequest({
      channel: "trae:conversation:send",
      body: {
        sessionId: session.sessionId,
        content: body.content,
        metadata: sanitizeSensitiveData(body.metadata || {})
      }
    });

    session.status = "running";
    session.updatedAt = new Date().toISOString();
    session.lastRequestId = dispatched.requestId;

    try {
      const result = await dispatched.response;
      session.status = "completed";
      session.updatedAt = new Date().toISOString();
      session.lastResult = {
        requestId: dispatched.requestId,
        text: result.response?.text || null,
        chunks: result.chunks
      };
      return {
        requestId: dispatched.requestId,
        result
      };
    } catch (error) {
      session.status = "error";
      session.updatedAt = new Date().toISOString();
      session.lastError =
        typeof driver.normalizeError === "function"
          ? driver.normalizeError(error, "AUTOMATION_REQUEST_FAILED")
          : normalizeAutomationError(error, "AUTOMATION_REQUEST_FAILED");
      throw new ApiError(session.lastError.code, session.lastError.message, 502, session.lastError.details);
    }
  }

  async function prepareGatewaySession(session) {
    const { driver } = await requireAutomationDriver();
    if (typeof driver.prepareSession !== "function") {
      throw new ApiError("AUTOMATION_PREPARE_UNAVAILABLE", "Trae automation does not support explicit session preparation", 503);
    }

    session.status = "running";
    session.updatedAt = new Date().toISOString();

    try {
      const result = await driver.prepareSession({
        channel: "trae:session:prepare",
        sessionId: session.sessionId
      });
      session.status = "idle";
      session.updatedAt = new Date().toISOString();
      session.lastRequestId = result.requestId || null;
      session.lastPreparation = {
        requestId: result.requestId || null,
        preparedAt: result.finishedAt || new Date().toISOString(),
        preparation: sanitizeSensitiveData(result.preparation || {})
      };
      return result;
    } catch (error) {
      session.status = "error";
      session.updatedAt = new Date().toISOString();
      session.lastError =
        typeof driver.normalizeError === "function"
          ? driver.normalizeError(error, "AUTOMATION_PREPARE_FAILED")
          : normalizeAutomationError(error, "AUTOMATION_PREPARE_FAILED");
      throw new ApiError(session.lastError.code, session.lastError.message, 502, session.lastError.details);
    }
  }

  async function dispatchStreamMessage(res, session, body, meta, streamMeta = {}) {
    const { driver } = await requireAutomationDriver();
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });

    const sendEvent = (event, payload) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const dispatched = driver.dispatchRequest({
      channel: "trae:conversation:stream",
      body: {
        sessionId: session.sessionId,
        content: body.content,
        metadata: sanitizeSensitiveData(body.metadata || {})
      },
      onEvent(event) {
        if (event.type === "done") {
          return;
        }
        if (event.error) {
          sendEvent("error", {
            code: event.error.code || "AUTOMATION_STREAM_ERROR",
            message: event.error.message || "Stream event failed",
            requestId: dispatched.requestId
          });
          return;
        }
        sendEvent("delta", {
          requestId: dispatched.requestId,
          type: event.type,
          chunk: Object.prototype.hasOwnProperty.call(event, "data") ? event.data : null
        });
      }
    });

    session.status = "running";
    session.updatedAt = new Date().toISOString();
    session.lastRequestId = dispatched.requestId;
    sendEvent("open", {
      success: true,
      code: "OK",
      requestId: meta.requestId,
      idempotencyKey: meta.idempotencyKey || null,
      sessionId: session.sessionId,
      streamRequestId: dispatched.requestId,
      ...streamMeta
    });

    try {
      const result = await dispatched.response;
      session.status = "completed";
      session.updatedAt = new Date().toISOString();
      session.lastResult = {
        requestId: dispatched.requestId,
        text: result.response?.text || null,
        chunks: result.chunks
      };
      sendEvent("done", {
        success: true,
        code: "OK",
        sessionId: session.sessionId,
        requestId: dispatched.requestId,
        result,
        ...streamMeta
      });
      res.end();
    } catch (error) {
      const normalizedError =
        typeof driver.normalizeError === "function"
          ? driver.normalizeError(error, "AUTOMATION_STREAM_FAILED")
          : normalizeAutomationError(error, "AUTOMATION_STREAM_FAILED");
      session.status = "error";
      session.updatedAt = new Date().toISOString();
      session.lastError = normalizedError;
      sendEvent("error", {
        success: false,
        code: normalizedError.code,
        message: normalizedError.message,
        details: normalizedError.details || {},
        requestId: dispatched.requestId,
        sessionId: session.sessionId,
        ...streamMeta
      });
      res.end();
    }
  }

  async function handleCreateSession(req, res, pathname, meta) {
    const replayed = getIdempotencyEntry(req.method, pathname, meta.idempotencyKey);
    if (replayed) {
      return writeApiSuccess(res, replayed.statusCode, replayed.data, {
        ...meta,
        replayed: true
      });
    }

    const body = await readJsonBody(req);
    const session = createSessionRecord(body.metadata || {});
    let preparation = null;
    if (body.prepare === true) {
      preparation = await prepareGatewaySession(session);
    }
    const data = {
      session,
      prepared: body.prepare === true,
      ...(preparation ? { preparation } : {})
    };
    setIdempotencyEntry(req.method, pathname, meta.idempotencyKey, {
      statusCode: 201,
      data
    });
    writeApiSuccess(res, 201, data, meta);
  }

  async function handleSendMessage(req, res, pathname, sessionId, meta) {
    const replayed = getIdempotencyEntry(req.method, pathname, meta.idempotencyKey);
    if (replayed) {
      return writeApiSuccess(res, replayed.statusCode, replayed.data, {
        ...meta,
        replayed: true
      });
    }

    const session = requireSession(sessionId);
    const body = assertValidMessageBody(await readJsonBody(req));
    const { requestId, result } = await dispatchBlockingMessage(session, body);
    const data = {
      sessionId,
      requestId,
      result
    };
    setIdempotencyEntry(req.method, pathname, meta.idempotencyKey, {
      statusCode: 200,
      data
    });
    writeApiSuccess(res, 200, data, meta);
  }

  async function handleStreamMessage(req, res, sessionId, meta) {
    const session = requireSession(sessionId);
    const body = assertValidMessageBody(await readJsonBody(req));
    return dispatchStreamMessage(res, session, body, meta);
  }

  async function handleChat(req, res, pathname, meta) {
    const replayed = getIdempotencyEntry(req.method, pathname, meta.idempotencyKey);
    if (replayed) {
      return writeApiSuccess(res, replayed.statusCode, replayed.data, {
        ...meta,
        replayed: true
      });
    }

    const body = assertValidMessageBody(await readJsonBody(req));
    const { session, sessionCreated } = resolveChatSession(body);
    const { requestId, result } = await dispatchBlockingMessage(session, body);
    const data = {
      sessionId: session.sessionId,
      session,
      sessionCreated,
      requestId,
      result
    };
    setIdempotencyEntry(req.method, pathname, meta.idempotencyKey, {
      statusCode: 200,
      data
    });
    writeApiSuccess(res, 200, data, meta);
  }

  async function handleChatStream(req, res, meta) {
    const body = assertValidMessageBody(await readJsonBody(req));
    const { session, sessionCreated } = resolveChatSession(body);
    return dispatchStreamMessage(res, session, body, meta, {
      sessionCreated
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const pathname = url.pathname;
    const isChatUiRoute = req.method === "GET" && (pathname === "/" || pathname === "/chat");
    const meta = resolveMeta(req);
    const startedAt = Date.now();
    let statusCode = 500;
    let outcome = "error";
    beginRequestStats();

    try {
      if (!isLoopbackAddress(resolveClientAddress(req))) {
        throw new ApiError("FORBIDDEN_REMOTE", "Only loopback clients may access this gateway", 403);
      }

      if (isChatUiRoute) {
        statusCode = 200;
        outcome = "success";
        return writeHtml(res, 200, getChatPageHtml());
      }

      if (pathname === "/openapi.json" && req.method === "GET") {
        statusCode = 200;
        outcome = "success";
        return writeJson(res, 200, buildOpenApiDocument({ serverUrl: resolveServerUrl(req) }));
      }

      if (pathname === "/openapi.yaml" && req.method === "GET") {
        statusCode = 200;
        outcome = "success";
        return writeText(res, 200, "application/yaml", buildOpenApiYaml({ serverUrl: resolveServerUrl(req) }));
      }

      authenticateRequest(req);
      validateRequestSource(req);
      enforceRateLimit(req);

      if (pathname === "/health" && req.method === "GET") {
        const runtimeStatus = await buildRuntimeStatus();
        statusCode = 200;
        outcome = "success";
        return writeApiSuccess(res, 200, { status: "ok", ...runtimeStatus }, meta);
      }

      if (pathname === "/ready" && req.method === "GET") {
        const runtimeStatus = await buildRuntimeStatus();
        if (runtimeStatus.automation.ready) {
          statusCode = 200;
          outcome = "success";
          return writeApiSuccess(res, 200, { status: "ready", ...runtimeStatus }, meta);
        }
        throw new ApiError("AUTOMATION_NOT_READY", "Trae automation is not ready", 503, runtimeStatus.automation.error || {});
      }

      if (pathname === "/debug/automation" && req.method === "GET" && enableDebugEndpoints) {
        const diagnostics = await buildAutomationDiagnostics();
        statusCode = 200;
        outcome = "success";
        return writeApiSuccess(res, 200, diagnostics, meta);
      }

      if (pathname === "/v1/sessions" && req.method === "POST") {
        statusCode = 201;
        outcome = "success";
        return await handleCreateSession(req, res, pathname, meta);
      }

      if (pathname === "/v1/chat" && req.method === "POST") {
        statusCode = 200;
        outcome = "success";
        return await handleChat(req, res, pathname, meta);
      }

      if (pathname === "/v1/chat/stream" && req.method === "POST") {
        statusCode = 200;
        outcome = "stream";
        return await handleChatStream(req, res, meta);
      }

      const streamSessionId = parseSessionIdFromPath(pathname, /^\/v1\/sessions\/([^/]+)\/messages\/stream$/);
      if (streamSessionId && req.method === "POST") {
        statusCode = 200;
        outcome = "stream";
        return await handleStreamMessage(req, res, streamSessionId, meta);
      }

      const messageSessionId = parseSessionIdFromPath(pathname, /^\/v1\/sessions\/([^/]+)\/messages$/);
      if (messageSessionId && req.method === "POST") {
        statusCode = 200;
        outcome = "success";
        return await handleSendMessage(req, res, pathname, messageSessionId, meta);
      }

      const statusSessionId = parseSessionIdFromPath(pathname, /^\/v1\/sessions\/([^/]+)$/);
      if (statusSessionId && req.method === "GET") {
        const session = requireSession(statusSessionId);
        statusCode = 200;
        outcome = "success";
        return writeApiSuccess(res, 200, { session }, meta);
      }

      throw new ApiError("NOT_FOUND", "Route not found", 404, {
        method: req.method,
        pathname
      });
    } catch (error) {
      const normalizedError =
        error instanceof ApiError
          ? error
          : new ApiError(error.code || "INTERNAL_ERROR", error.message || "Internal server error", 500, error.details || {});
      statusCode = normalizedError.statusCode;
      outcome = normalizedError.code;
      writeApiError(res, normalizedError, meta);
    } finally {
      const auditEntry = buildAuditEntry(req, pathname, meta, startedAt, statusCode, outcome);
      completeRequestStats(auditEntry);
      emitRequestTrace(auditEntry);
      emitAuditLog(auditEntry);
    }
  });

  return {
    server,
    getSnapshot() {
      return {
        sessionCount: sessions.size,
        idempotencyCount: idempotencyStore.size,
        rateLimitEntries: rateLimitStore.size,
        metrics: getRequestStatsSnapshot(),
        automationSnapshot: typeof automationDriver?.getSnapshot === "function" ? automationDriver.getSnapshot() : null
      };
    },
    async getRuntimeStatus() {
      return buildRuntimeStatus();
    }
  };
}

function startGatewayServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 8787);
  const host = normalizeLoopbackHost(options.host || process.env.HOST || "127.0.0.1");
  if (!isAllowedListenHost(host)) {
    throw new ApiError("INVALID_LISTEN_HOST", "Gateway host must stay on a local loopback address", 400, {
      host,
      allowed: ["127.0.0.1", "::1", "localhost"]
    });
  }

  const { server, getRuntimeStatus } = createGatewayServer(options);
  server.listen(port, host, () => {
    getRuntimeStatus()
      .then((runtimeStatus) => {
        console.log(
          JSON.stringify(
            {
              message: "HTTP gateway started",
              host,
              port,
              readiness: runtimeStatus.automation.ready ? "ready" : "not_ready"
            },
            null,
            2
          )
        );
      })
      .catch((error) => {
        console.error(
          JSON.stringify(
            {
              code: "GATEWAY_START_DIAGNOSTIC_FAILED",
              message: error.message
            },
            null,
            2
          )
        );
      });
  });
  return server;
}

module.exports = {
  ApiError,
  createGatewayServer,
  startGatewayServer
};
