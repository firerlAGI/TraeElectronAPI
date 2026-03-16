# OpenClaw Integration Guide

This guide is for users who want OpenClaw to use Trae as an IDE tool through TraeAPI.

Target flow:

`OpenClaw agent -> trae_delegate -> TraeAPI -> Trae desktop`

This is not a model-provider integration. OpenClaw keeps using its own configured LLM. Trae is exposed as a callable IDE tool.

## Prerequisites

- Windows machine with Trae installed.
- A working OpenClaw installation.
- This repository available locally.
- Trae must be able to start with `--remote-debugging-port=<port>`.

## 1. Start TraeAPI

Recommended path:

1. Double-click `start-traeapi.cmd`

Or from a terminal:

```bash
npm run quickstart
```

Quickstart will try to:

- attach to an existing Trae window first
- fall back to a dedicated Trae window automatically
- seed that dedicated profile from your local Trae data when possible
- start the local gateway on `http://127.0.0.1:8787`

Verify readiness:

```bash
curl http://127.0.0.1:8787/ready
```

You want a `success: true` response.

## 2. Load the OpenClaw Plugin

Simplest option while both projects live in local checkouts:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "C:\\path\\to\\TraeAPI\\integrations\\openclaw-trae-plugin"
      ]
    },
    "entries": {
      "trae-ide": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "autoStart": true,
          "quickstartCommand": "C:\\path\\to\\TraeAPI\\start-traeapi.cmd",
          "quickstartCwd": "C:\\path\\to\\TraeAPI"
        }
      }
    }
  }
}
```

If your gateway uses a bearer token, also set:

```json
{
  "plugins": {
    "entries": {
      "trae-ide": {
        "config": {
          "token": "your-token"
        }
      }
    }
  }
}
```

You can also start from repository examples instead of writing the config from scratch:

- [Plugin example config](../integrations/openclaw-trae-plugin/examples/openclaw.config.example.json)
- [Minimal plugin config](../integrations/openclaw-trae-plugin/examples/openclaw.minimal.config.json)

## 3. Enable The Tools Correctly

Use `alsoAllow`, not a plugin-only `allow` list.

Recommended:

```json
{
  "tools": {
    "alsoAllow": ["trae-ide"]
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "alsoAllow": ["trae_status", "trae_delegate"]
        }
      }
    ]
  }
}
```

Reason:

- OpenClaw strips plugin-only `tools.allow` lists to avoid hiding core tools.
- `tools.alsoAllow` is the additive path that keeps core tools visible while exposing plugin tools.

After changing config, restart the OpenClaw Gateway.

## 4. Validate The Plugin

Check that OpenClaw sees the plugin:

```bash
openclaw plugins info trae-ide
```

You should see:

- plugin status `loaded`
- tools `trae_status, trae_delegate`

Then ask OpenClaw something explicit:

- `Use trae_status exactly once and tell me whether Trae is ready.`
- `Use trae_delegate exactly once and ask Trae to summarize this project.`

## 5. What Was Verified In Live Testing

This repository has been validated with a real local OpenClaw checkout and a real Trae desktop session:

- `trae_status` became visible to the agent after switching to `alsoAllow`
- `trae_delegate` completed an end-to-end tool call through OpenClaw
- direct `POST /v1/chat` against TraeAPI also succeeded

One real-world detail: Trae may prepend its own assistant style text such as `SOLO Coder` to replies, so exact-output prompts may still include that prefix.

## Troubleshooting

`trae_status` or `trae_delegate` does not appear inside the agent

- Confirm the plugin loads with `openclaw plugins info trae-ide`
- Replace plugin-only `tools.allow` with `tools.alsoAllow`
- Restart the OpenClaw Gateway after config changes

`/ready` is false

- TraeAPI can reach Trae, but the current Trae page is not automation-ready
- The easiest recovery is usually:
  1. close running Trae windows
  2. start TraeAPI again
  3. let it relaunch Trae with remote debugging

Trae opens but still lands on the wrong screen

- Make sure Trae is logged in
- Make sure a project is open
- Run `npm run inspect:trae` to inspect selectors and page state

TraeAPI falls back to a dedicated window and asks for login again

- Keep `TRAE_QUICKSTART_PROFILE_SEED=1`
- If your main Trae process is still holding locked cookie files, the seeded isolated profile may still miss part of the login state
- In that case, restart Trae through TraeAPI so the main logged-in profile is the one exposing the debug port
