# TraeAPI

[English](README.md) | [中文](README.zh-CN.md)

TraeAPI is a local HTTP bridge for the Trae desktop app.

It connects to the Trae Electron window through the Chrome DevTools Protocol, drives the rendered UI with DOM selectors, and exposes a stable local API that other tools can call.

This is a local desktop bridge, not an official Trae API.

## Quick Start

### Windows One-Click Start

If you are on Windows, the intended path is simple:

1. Double-click [start-traeapi.cmd](start-traeapi.cmd)

On the first run, TraeAPI will:

- create `.env` from [.env.example](.env.example) if needed
- auto-detect `Trae.exe` when possible
- create a local workspace folder if you did not configure one yet
- try to attach to your existing Trae window first
- automatically launch a dedicated Trae window if the existing one is not automation-ready
- seed that dedicated Trae profile from your existing local Trae data when possible so you do not have to log in again
- start the local gateway
- open the built-in chat page in your browser

If Trae cannot be auto-detected, the launcher will ask for the Trae executable path once and save it into `.env`.

You can run the same flow from a terminal:

```bash
npm run quickstart
```

After startup succeeds, use:

- Chat page: `http://127.0.0.1:8787/chat`
- API base: `http://127.0.0.1:8787`

## What Users Need to Know

- TraeAPI runs locally on your machine.
- Trae must support `--remote-debugging-port=<port>`.
- TraeAPI will open a project folder in Trae. If you did not set one, it will create a default local workspace automatically.
- If your current Trae window is unsuitable for automation, quickstart will switch to a dedicated Trae profile automatically so the user does not have to manage ports or Chromium profiles manually.

## Public API

Stable local endpoints:

- `GET /health`
- `GET /ready`
- `GET /openapi.json`
- `GET /openapi.yaml`
- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/sessions`
- `GET /v1/sessions/{sessionId}`
- `POST /v1/sessions/{sessionId}/messages`
- `POST /v1/sessions/{sessionId}/messages/stream`

Full request and response details are in [docs/api.md](docs/api.md).

OpenAPI files are available at runtime and in the repository:

- [docs/openapi.json](docs/openapi.json)
- [docs/openapi.yaml](docs/openapi.yaml)

## Minimal Usage

Blocking request:

```bash
curl -X POST http://127.0.0.1:8787/v1/chat ^
  -H "content-type: application/json" ^
  -d "{\"content\":\"Reply with exactly: OK\"}"
```

Streaming request:

```bash
curl -N -X POST http://127.0.0.1:8787/v1/chat/stream ^
  -H "accept: text/event-stream" ^
  -H "content-type: application/json" ^
  -d "{\"content\":\"Explain what you are doing step by step.\"}"
```

Examples:

- Python: [examples/python/client.py](examples/python/client.py)
- Node.js: [examples/node/client.mjs](examples/node/client.mjs)

## OpenClaw Integration

If you want OpenClaw to use Trae as an IDE tool, use the native plugin in [integrations/openclaw-trae-plugin](integrations/openclaw-trae-plugin/README.md).

That plugin exposes `trae_status` and `trae_delegate` inside OpenClaw, so OpenClaw can keep using its own LLM while delegating IDE work to Trae through TraeAPI.

If your OpenClaw config uses explicit tool policy, enable the plugin additively with `tools.alsoAllow` or `agents.list[].tools.alsoAllow`, not a plugin-only `tools.allow`.

For a step-by-step user guide, see [docs/openclaw-integration.md](docs/openclaw-integration.md).

## Manual Setup

If you do not want the one-click launcher:

1. Install dependencies:

```bash
npm install
```

2. Copy [.env.example](.env.example) to `.env` and set at least:

- `TRAE_BIN`
- `TRAE_PROJECT_PATH`
- `TRAE_COMPOSER_SELECTORS`
- `TRAE_SEND_BUTTON_SELECTORS`
- `TRAE_RESPONSE_SELECTORS`

3. Start Trae:

```bash
npm run start:trae
```

4. Start the gateway:

```bash
npm run start:gateway
```

5. Verify:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/ready
```

## Configuration

See [.env.example](.env.example) for the full list.

Important settings:

- `TRAE_BIN`: path to `Trae.exe`
- `TRAE_PROJECT_PATH`: project folder Trae should open
- `TRAE_REMOTE_DEBUGGING_PORT`: primary CDP port
- `TRAE_QUICKSTART_USE_ISOLATED_PROFILE`: lets quickstart fall back to a dedicated Trae window automatically
- `TRAE_QUICKSTART_REMOTE_DEBUGGING_PORT`: CDP port for the dedicated quickstart window
- `TRAE_QUICKSTART_USER_DATA_DIR`: Chromium profile directory for the dedicated quickstart window
- `TRAE_QUICKSTART_PROFILE_SEED`: enables copying login/session state from the existing local Trae profile into the isolated quickstart profile
- `TRAE_QUICKSTART_PROFILE_SEED_SOURCE_DIR`: override the local Trae profile root used for isolated-profile seeding
- `TRAE_QUICKSTART_OPEN_CHAT`: automatically opens `/chat` after quickstart is ready
- `TRAE_COMPOSER_SELECTORS`: selectors for the input area
- `TRAE_SEND_BUTTON_SELECTORS`: selectors for the send button
- `TRAE_RESPONSE_SELECTORS`: selectors for final reply content
- `TRAE_ACTIVITY_SELECTORS`: selectors for process text and activity text
- `TRAE_NEW_CHAT_SELECTORS`: selectors used to create a fresh Trae conversation
- `TRAE_GATEWAY_TOKEN`: optional Bearer token for API routes
- `TRAE_ALLOWED_ORIGINS`: optional browser origin allowlist
- `TRAE_ENABLE_DEBUG_ENDPOINTS`: enables `/debug/automation`

## Selector Discovery

If the built-in selectors stop matching after a Trae update:

```bash
npm run inspect:trae
```

The inspector prints:

- matched target info
- selector hit counts
- visible composer and send-button candidates
- response and activity diagnostics

## Safe Attach Mode

If Trae is already running and you do not want scripts to relaunch it:

```bash
set TRAE_SAFE_ATTACH_ONLY=1
npm run start:gateway
```

If you want the local API to stay up even while Trae is offline:

```bash
set TRAE_SAFE_ATTACH_ONLY=1
set TRAE_ENABLE_MOCK_BRIDGE=1
npm run start:gateway
```

## Limitations

- This bridge reads rendered DOM text. It does not use OCR and does not call a private Trae API.
- Trae UI updates can break selectors.
- Process text and final reply text both come from the rendered UI, so task streams may include intermediate status text.
- Sessions are in-memory gateway sessions, not durable Trae-side IDs.
- Requests are serialized so multiple callers do not type into the same Trae window at once.

## Debugging

Basic checks:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/ready
npm run inspect:trae
```

Optional automation diagnostics:

```bash
set TRAE_ENABLE_DEBUG_ENDPOINTS=1
curl http://127.0.0.1:8787/debug/automation
```

## Validation

```bash
npm test
npm run lint
npm run typecheck
```
