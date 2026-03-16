# TraeAPI HTTP API

## Overview

TraeAPI exposes a local HTTP surface over a running Trae desktop window.

- Transport: local HTTP on loopback only
- Automation backend: Chrome DevTools Protocol + DOM automation
- Default base URL: `http://127.0.0.1:8787`
- Response format: JSON for normal endpoints, Server-Sent Events for stream mode
- Machine-readable contract: `GET /openapi.json` and `GET /openapi.yaml`

This is a local desktop bridge, not an official Trae server-side API.

## Requirements

- Trae must be running with a remote debugging port enabled.
- Trae must have a project open before message automation is attempted.
- The configured DOM selectors must match the current Trae UI.

## Authentication

If `TRAE_GATEWAY_TOKEN` is set, API routes require one of:

- `Authorization: Bearer <token>`
- `x-trae-token: <token>`

`/` and `/chat` remain accessible without auth so the built-in local UI can load.

## Common Response Shape

Successful JSON responses:

```json
{
  "success": true,
  "code": "OK",
  "data": {},
  "meta": {
    "requestId": "uuid",
    "idempotencyKey": null,
    "replayed": false
  }
}
```

Error responses:

```json
{
  "success": false,
  "code": "AUTOMATION_NOT_READY",
  "message": "Trae automation is not ready",
  "details": {},
  "meta": {
    "requestId": "uuid",
    "idempotencyKey": null
  }
}
```

## Session Model

HTTP sessions are logical gateway sessions.

- A session does not equal a Trae-internal conversation object.
- `POST /v1/chat` and `POST /v1/chat/stream` can auto-create a logical session for you.
- If `TRAE_NEW_CHAT_SELECTORS` is configured, the driver will attempt to open a fresh Trae conversation the first time a new HTTP session sends a message.
- Session state is in-memory only and is lost when the gateway restarts.

Session status values:

- `idle`
- `running`
- `completed`
- `error`

## Endpoints

### POST /v1/chat

Convenience endpoint for callers that do not want to create a session first.

Behavior:

- If `sessionId` is omitted, the gateway auto-creates a session.
- If `sessionId` is provided, the existing session is reused.
- `sessionMetadata` is only applied when a new session is auto-created.

Request body:

```json
{
  "content": "Summarize this project in one paragraph.",
  "sessionMetadata": {
    "client": "demo"
  },
  "metadata": {
    "caller": "example-client"
  }
}
```

Response:

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "sessionId": "uuid",
    "sessionCreated": true,
    "session": {
      "sessionId": "uuid",
      "status": "completed"
    },
    "requestId": "uuid",
    "result": {
      "status": "ok",
      "response": {
        "text": "reply text"
      }
    }
  }
}
```

### POST /v1/chat/stream

Convenience streaming endpoint.

Request body shape matches `POST /v1/chat`.

Events emitted by the gateway:

- `event: open`
- `event: delta`
- `event: done`
- `event: error`

The `open`, `done`, and `error` payloads include `sessionId`.
If the gateway auto-created a session for the request, they also include `sessionCreated: true`.

### GET /health

Returns gateway liveness and runtime metrics.

Example response:

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "status": "ok",
    "service": "trae-cdp-http-bridge",
    "uptimeMs": 1250,
    "automation": {
      "ready": true,
      "mode": "cdp"
    },
    "hook": {
      "ready": true,
      "mode": "cdp"
    },
    "metrics": {
      "totalRequests": 3,
      "successfulRequests": 3,
      "failedRequests": 0,
      "inflightRequests": 0,
      "avgDurationMs": 42,
      "maxDurationMs": 103,
      "errorByCode": {},
      "routeStats": {
        "/health": {
          "total": 1,
          "failed": 0
        }
      }
    }
  }
}
```

### GET /ready

Returns `200` when the Trae target is attached and the configured selectors are ready.

Returns `503` with `AUTOMATION_NOT_READY` if the desktop target is missing or the selectors do not match.

### POST /v1/sessions

Creates a logical gateway session.

Request body:

```json
{
  "metadata": {
    "client": "demo"
  }
}
```

Response:

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "session": {
      "sessionId": "uuid",
      "createdAt": "2026-03-16T00:00:00.000Z",
      "updatedAt": "2026-03-16T00:00:00.000Z",
      "status": "idle",
      "metadata": {
        "client": "demo"
      }
    }
  }
}
```

### GET /v1/sessions/{sessionId}

Returns the in-memory gateway session state.

Useful fields:

- `status`
- `lastRequestId`
- `lastResult`
- `lastError`

### POST /v1/sessions/{sessionId}/messages

Sends one prompt and waits for the final response.

Request body:

```json
{
  "content": "Summarize this project in one paragraph.",
  "metadata": {
    "caller": "example-client"
  }
}
```

Response:

```json
{
  "success": true,
  "code": "OK",
  "data": {
    "sessionId": "uuid",
    "requestId": "uuid",
    "result": {
      "status": "ok",
      "requestId": "uuid",
      "channel": "trae:conversation:send",
      "startedAt": "2026-03-16T00:00:00.000Z",
      "finishedAt": "2026-03-16T00:00:07.000Z",
      "events": [
        {
          "type": "replace",
          "data": "reply text"
        },
        {
          "type": "done"
        }
      ],
      "chunks": [
        "reply text"
      ],
      "response": {
        "text": "reply text"
      },
      "target": {
        "id": "page-id",
        "title": "my-project - Trae",
        "url": "vscode-file://..."
      }
    }
  }
}
```

### POST /v1/sessions/{sessionId}/messages/stream

Sends one prompt and streams incremental text back as Server-Sent Events.

Request body:

```json
{
  "content": "Explain what Trae is currently doing."
}
```

Headers:

- `Content-Type: application/json`
- `Accept: text/event-stream`

Events emitted by the gateway:

#### `event: open`

```json
{
  "success": true,
  "code": "OK",
  "requestId": "http-request-id",
  "idempotencyKey": null,
  "sessionId": "session-id",
  "streamRequestId": "automation-request-id"
}
```

#### `event: delta`

```json
{
  "requestId": "automation-request-id",
  "type": "replace",
  "chunk": "partial text"
}
```

`type` values:

- `replace`: the current best full text snapshot changed
- `delta`: an append-only chunk was detected

#### `event: done`

```json
{
  "success": true,
  "code": "OK",
  "sessionId": "session-id",
  "requestId": "automation-request-id",
  "result": {
    "status": "ok",
    "response": {
      "text": "final text"
    }
  }
}
```

#### `event: error`

```json
{
  "success": false,
  "code": "AUTOMATION_RESPONSE_TIMEOUT",
  "message": "Timed out waiting for a DOM response from Trae",
  "details": {},
  "requestId": "automation-request-id"
}
```

## Idempotency

`POST /v1/sessions` and `POST /v1/sessions/{id}/messages` support `Idempotency-Key`.

- Header name: `Idempotency-Key`
- Replay scope: method + path + key
- Replayed responses set `meta.replayed=true`

Streaming requests are not replayed from the idempotency store.

## Common Error Codes

Gateway and routing:

- `INVALID_JSON`
- `PAYLOAD_TOO_LARGE`
- `NOT_FOUND`
- `SESSION_NOT_FOUND`
- `INVALID_MESSAGE_CONTENT`

Security:

- `UNAUTHORIZED`
- `FORBIDDEN_REMOTE`
- `FORBIDDEN_ORIGIN`
- `RATE_LIMITED`

Automation readiness:

- `AUTOMATION_NOT_READY`
- `AUTOMATION_SELECTOR_NOT_READY`
- `CDP_TARGET_NOT_FOUND`

Automation execution:

- `AUTOMATION_SUBMIT_FAILED`
- `AUTOMATION_RESPONSE_TIMEOUT`
- `AUTOMATION_NEW_CHAT_FAILED`
- `AUTOMATION_REQUEST_FAILED`

## Operational Notes

- The gateway only listens on loopback addresses.
- Selector mismatches are the most common cause of readiness failures.
- Process text and final reply text are extracted from the rendered DOM, not from an internal Trae API object.
- Requests are serialized inside the automation driver to avoid overlapping UI interactions in the same Trae window.

## Diagnostics

Recommended checks:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/ready
npm run inspect:trae
```

Optional debug endpoint:

```bash
set TRAE_ENABLE_DEBUG_ENDPOINTS=1
curl http://127.0.0.1:8787/debug/automation
```
