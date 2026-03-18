const packageJson = require("../../package.json");

function buildOpenApiDocument(options = {}) {
  const serverUrl = String(options.serverUrl || "http://127.0.0.1:8787");
  return {
    openapi: "3.1.0",
    info: {
      title: "TraeAPI HTTP API",
      version: packageJson.version,
      description:
        "Local HTTP bridge for Trae desktop backed by Chrome DevTools Protocol and DOM automation. This service is loopback-only and is not an official Trae API."
    },
    servers: [
      {
        url: serverUrl,
        description: "Local loopback gateway"
      }
    ],
    tags: [
      {
        name: "system",
        description: "Gateway liveness and readiness probes"
      },
      {
        name: "sessions",
        description: "Logical gateway sessions"
      },
      {
        name: "messages",
        description: "Prompt submission and response streaming"
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Used when TRAE_GATEWAY_TOKEN is configured."
        },
        traeTokenHeader: {
          type: "apiKey",
          in: "header",
          name: "x-trae-token",
          description: "Alternative token header used when TRAE_GATEWAY_TOKEN is configured."
        }
      },
      parameters: {
        RequestIdHeader: {
          name: "x-request-id",
          in: "header",
          required: false,
          description: "Optional caller-supplied request identifier echoed back in meta.requestId.",
          schema: {
            type: "string"
          }
        },
        IdempotencyKeyHeader: {
          name: "idempotency-key",
          in: "header",
          required: false,
          description: "Optional idempotency key for replay-safe POST requests.",
          schema: {
            type: "string"
          }
        },
        SessionIdPath: {
          name: "sessionId",
          in: "path",
          required: true,
          description: "Logical gateway session identifier.",
          schema: {
            type: "string"
          }
        }
      },
      schemas: {
        ApiMeta: {
          type: "object",
          additionalProperties: false,
          properties: {
            requestId: { type: "string" },
            idempotencyKey: {
              oneOf: [{ type: "string" }, { type: "null" }]
            },
            replayed: { type: "boolean" }
          },
          required: ["requestId", "idempotencyKey", "replayed"]
        },
        ErrorMeta: {
          type: "object",
          additionalProperties: false,
          properties: {
            requestId: { type: "string" },
            idempotencyKey: {
              oneOf: [{ type: "string" }, { type: "null" }]
            }
          },
          required: ["requestId", "idempotencyKey"]
        },
        ErrorResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            success: { type: "boolean", const: false },
            code: { type: "string" },
            message: { type: "string" },
            details: {
              type: "object",
              additionalProperties: true
            },
            meta: { $ref: "#/components/schemas/ErrorMeta" }
          },
          required: ["success", "code", "message", "details", "meta"]
        },
        Session: {
          type: "object",
          additionalProperties: true,
          properties: {
            sessionId: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
            status: {
              type: "string",
              enum: ["idle", "running", "completed", "error"]
            },
            metadata: {
              type: "object",
              additionalProperties: true
            },
            lastRequestId: {
              oneOf: [{ type: "string" }, { type: "null" }]
            },
            lastResult: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: true
                }
              ]
            },
            lastError: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: true
                }
              ]
            }
          },
          required: ["sessionId", "createdAt", "updatedAt", "status", "metadata"]
        },
        SessionCreateRequest: {
          type: "object",
          additionalProperties: false,
          properties: {
            metadata: {
              type: "object",
              additionalProperties: true
            },
            prepare: {
              type: "boolean",
              description: "When true, the gateway immediately switches Trae into a fresh conversation for this session."
            }
          }
        },
        MessageRequest: {
          type: "object",
          additionalProperties: false,
          properties: {
            content: {
              type: "string",
              minLength: 1
            },
            metadata: {
              type: "object",
              additionalProperties: true
            }
          },
          required: ["content"]
        },
        ChatRequest: {
          type: "object",
          additionalProperties: false,
          properties: {
            content: {
              type: "string",
              minLength: 1
            },
            metadata: {
              type: "object",
              additionalProperties: true
            },
            sessionId: {
              type: "string",
              description: "Optional existing gateway session ID to reuse."
            },
            sessionMetadata: {
              type: "object",
              additionalProperties: true,
              description: "Used only when sessionId is omitted and a new session is auto-created."
            }
          },
          required: ["content"]
        },
        MessageEvent: {
          type: "object",
          additionalProperties: true,
          properties: {
            type: { type: "string" },
            data: {
              oneOf: [{ type: "string" }, { type: "null" }]
            }
          },
          required: ["type"]
        },
        MessageResult: {
          type: "object",
          additionalProperties: true,
          properties: {
            status: { type: "string" },
            requestId: { type: "string" },
            channel: { type: "string" },
            startedAt: { type: "string", format: "date-time" },
            finishedAt: { type: "string", format: "date-time" },
            events: {
              type: "array",
              items: { $ref: "#/components/schemas/MessageEvent" }
            },
            chunks: {
              type: "array",
              items: { type: "string" }
            },
            response: {
              type: "object",
              additionalProperties: true,
              properties: {
                text: {
                  oneOf: [{ type: "string" }, { type: "null" }]
                }
              }
            },
            target: {
              oneOf: [
                { type: "null" },
                {
                  type: "object",
                  additionalProperties: true
                }
              ]
            }
          },
          required: ["status", "requestId", "channel", "startedAt", "finishedAt", "events", "chunks", "response"]
        }
      },
      responses: {
        Error: {
          description: "Error response envelope",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" }
            }
          }
        }
      }
    },
    paths: {
      "/health": {
        get: {
          tags: ["system"],
          summary: "Gateway liveness probe",
          description: "Returns gateway uptime, runtime metrics, and current automation readiness state.",
          parameters: [{ $ref: "#/components/parameters/RequestIdHeader" }],
          responses: {
            "200": {
              description: "Gateway is reachable",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      success: { type: "boolean", const: true },
                      code: { type: "string", const: "OK" },
                      data: {
                        type: "object",
                        additionalProperties: true,
                        properties: {
                          status: { type: "string", const: "ok" },
                          service: { type: "string" },
                          uptimeMs: { type: "number" },
                          automation: {
                            type: "object",
                            additionalProperties: true
                          },
                          hook: {
                            type: "object",
                            additionalProperties: true
                          },
                          metrics: {
                            type: "object",
                            additionalProperties: true
                          }
                        },
                        required: ["status", "service", "uptimeMs", "automation", "hook", "metrics"]
                      },
                      meta: { $ref: "#/components/schemas/ApiMeta" }
                    },
                    required: ["success", "code", "data", "meta"]
                  }
                }
              }
            },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/ready": {
        get: {
          tags: ["system"],
          summary: "Gateway readiness probe",
          description: "Returns 200 only when the Trae desktop target is attached and required selectors are ready.",
          parameters: [{ $ref: "#/components/parameters/RequestIdHeader" }],
          responses: {
            "200": {
              description: "Automation is ready",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      success: { type: "boolean", const: true },
                      code: { type: "string", const: "OK" },
                      data: {
                        type: "object",
                        additionalProperties: true,
                        properties: {
                          status: { type: "string", const: "ready" }
                        },
                        required: ["status"]
                      },
                      meta: { $ref: "#/components/schemas/ApiMeta" }
                    },
                    required: ["success", "code", "data", "meta"]
                  }
                }
              }
            },
            "503": { $ref: "#/components/responses/Error" },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/v1/chat": {
        post: {
          tags: ["messages"],
          summary: "Send one prompt without creating a session first",
          description:
            "Convenience endpoint. If sessionId is omitted, the gateway auto-creates a logical session, sends the prompt, and returns the created session alongside the result.",
          parameters: [
            { $ref: "#/components/parameters/RequestIdHeader" },
            { $ref: "#/components/parameters/IdempotencyKeyHeader" }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Prompt completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      success: { type: "boolean", const: true },
                      code: { type: "string", const: "OK" },
                      data: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          sessionId: { type: "string" },
                          sessionCreated: { type: "boolean" },
                          session: { $ref: "#/components/schemas/Session" },
                          requestId: { type: "string" },
                          result: { $ref: "#/components/schemas/MessageResult" }
                        },
                        required: ["sessionId", "sessionCreated", "session", "requestId", "result"]
                      },
                      meta: { $ref: "#/components/schemas/ApiMeta" }
                    },
                    required: ["success", "code", "data", "meta"]
                  }
                }
              }
            },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/v1/chat/stream": {
        post: {
          tags: ["messages"],
          summary: "Stream one prompt without creating a session first",
          description:
            "Convenience streaming endpoint. If sessionId is omitted, the gateway auto-creates a logical session and includes sessionCreated in stream events.",
          parameters: [
            { $ref: "#/components/parameters/RequestIdHeader" },
            { $ref: "#/components/parameters/IdempotencyKeyHeader" }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChatRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Server-Sent Events stream",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string"
                  },
                  example:
                    "event: open\ndata: {\"success\":true,\"code\":\"OK\",\"sessionId\":\"...\",\"sessionCreated\":true}\n\nevent: delta\ndata: {\"requestId\":\"...\",\"type\":\"replace\",\"chunk\":\"partial\"}\n\nevent: done\ndata: {\"success\":true,\"code\":\"OK\",\"requestId\":\"...\",\"sessionCreated\":true}\n\n"
                }
              }
            },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/v1/sessions": {
        post: {
          tags: ["sessions"],
          summary: "Create a logical gateway session",
          description:
            "Creates an in-memory session used to associate later message requests. When prepare is true, the gateway also clicks Trae's new chat action immediately.",
          parameters: [
            { $ref: "#/components/parameters/RequestIdHeader" },
            { $ref: "#/components/parameters/IdempotencyKeyHeader" }
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SessionCreateRequest" }
              }
            }
          },
          responses: {
            "201": {
              description: "Session created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      success: { type: "boolean", const: true },
                      code: { type: "string", const: "OK" },
                      data: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          session: { $ref: "#/components/schemas/Session" },
                          prepared: { type: "boolean" },
                          preparation: {
                            oneOf: [
                              { type: "null" },
                              {
                                type: "object",
                                additionalProperties: true
                              }
                            ]
                          }
                        },
                        required: ["session", "prepared"]
                      },
                      meta: { $ref: "#/components/schemas/ApiMeta" }
                    },
                    required: ["success", "code", "data", "meta"]
                  }
                }
              }
            },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/v1/sessions/{sessionId}": {
        get: {
          tags: ["sessions"],
          summary: "Get session state",
          parameters: [
            { $ref: "#/components/parameters/RequestIdHeader" },
            { $ref: "#/components/parameters/SessionIdPath" }
          ],
          responses: {
            "200": {
              description: "Current in-memory session state",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      success: { type: "boolean", const: true },
                      code: { type: "string", const: "OK" },
                      data: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          session: { $ref: "#/components/schemas/Session" }
                        },
                        required: ["session"]
                      },
                      meta: { $ref: "#/components/schemas/ApiMeta" }
                    },
                    required: ["success", "code", "data", "meta"]
                  }
                }
              }
            },
            "404": { $ref: "#/components/responses/Error" },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/v1/sessions/{sessionId}/messages": {
        post: {
          tags: ["messages"],
          summary: "Send one prompt and wait for completion",
          description: "Submits a prompt to the attached Trae window and returns the completed automation result envelope.",
          parameters: [
            { $ref: "#/components/parameters/RequestIdHeader" },
            { $ref: "#/components/parameters/IdempotencyKeyHeader" },
            { $ref: "#/components/parameters/SessionIdPath" }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Prompt completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      success: { type: "boolean", const: true },
                      code: { type: "string", const: "OK" },
                      data: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          sessionId: { type: "string" },
                          requestId: { type: "string" },
                          result: { $ref: "#/components/schemas/MessageResult" }
                        },
                        required: ["sessionId", "requestId", "result"]
                      },
                      meta: { $ref: "#/components/schemas/ApiMeta" }
                    },
                    required: ["success", "code", "data", "meta"]
                  }
                }
              }
            },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      },
      "/v1/sessions/{sessionId}/messages/stream": {
        post: {
          tags: ["messages"],
          summary: "Send one prompt and stream incremental events",
          description:
            "Returns Server-Sent Events. The gateway emits event: open, event: delta, event: done, and event: error.",
          parameters: [
            { $ref: "#/components/parameters/RequestIdHeader" },
            { $ref: "#/components/parameters/IdempotencyKeyHeader" },
            { $ref: "#/components/parameters/SessionIdPath" }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageRequest" }
              }
            }
          },
          responses: {
            "200": {
              description: "Server-Sent Events stream",
              content: {
                "text/event-stream": {
                  schema: {
                    type: "string"
                  },
                  example:
                    "event: open\ndata: {\"success\":true,\"code\":\"OK\",\"sessionId\":\"...\"}\n\nevent: delta\ndata: {\"requestId\":\"...\",\"type\":\"replace\",\"chunk\":\"partial\"}\n\nevent: done\ndata: {\"success\":true,\"code\":\"OK\",\"requestId\":\"...\"}\n\n"
                }
              }
            },
            default: { $ref: "#/components/responses/Error" }
          }
        }
      }
    }
  };
}

function isScalar(value) {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function formatYamlScalar(value) {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return JSON.stringify(value);
}

function formatYamlKey(key) {
  const stringKey = String(key);
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(stringKey) ? stringKey : JSON.stringify(stringKey);
}

function toYaml(value, indent = 0) {
  const prefix = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) {
      return `${prefix}[]`;
    }
    return value
      .map((item) => {
        if (isScalar(item)) {
          return `${prefix}- ${formatYamlScalar(item)}`;
        }
        return `${prefix}-\n${toYaml(item, indent + 2)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) {
      return `${prefix}{}`;
    }
    return entries
      .map(([key, nestedValue]) => {
        const formattedKey = formatYamlKey(key);
        if (isScalar(nestedValue)) {
          return `${prefix}${formattedKey}: ${formatYamlScalar(nestedValue)}`;
        }
        if (Array.isArray(nestedValue) && nestedValue.length === 0) {
          return `${prefix}${formattedKey}: []`;
        }
        if (nestedValue && typeof nestedValue === "object" && Object.keys(nestedValue).length === 0) {
          return `${prefix}${formattedKey}: {}`;
        }
        return `${prefix}${formattedKey}:\n${toYaml(nestedValue, indent + 2)}`;
      })
      .join("\n");
  }

  return `${prefix}${formatYamlScalar(value)}`;
}

function buildOpenApiYaml(options = {}) {
  return `${toYaml(buildOpenApiDocument(options))}\n`;
}

module.exports = {
  buildOpenApiDocument,
  buildOpenApiYaml
};
