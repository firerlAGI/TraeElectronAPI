# OpenClaw Integration Guide

This guide is for users who want OpenClaw to use Trae as an IDE tool through TraeAPI.

Target flow:

`OpenClaw agent -> trae_delegate -> TraeAPI -> Trae desktop`

This is not a model-provider integration. OpenClaw keeps using its own configured LLM. Trae is exposed as a callable IDE tool.

## Prerequisites

- Windows or macOS with Trae installed.
- A working OpenClaw installation.
- This repository available locally.
- Trae must be able to start with `--remote-debugging-port=<port>`.

## 1. Start TraeAPI

Recommended path:

- Windows: double-click `start-traeapi.cmd`
- macOS: double-click `start-traeapi.command`

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
        "/path/to/TraeAPI/integrations/openclaw-trae-plugin"
      ]
    },
    "entries": {
      "trae-ide": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "autoStart": true,
          "quickstartCommand": "\"/path/to/TraeAPI/start-traeapi.command\"",
          "quickstartCwd": "/path/to/TraeAPI"
        }
      }
    }
  }
}
```

Windows users can keep using `"C:\path\to\TraeAPI\start-traeapi.cmd"` as the `quickstartCommand`. Keep the outer quotes if the path may contain spaces.

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
          "alsoAllow": ["trae_status", "trae_new_chat", "trae_delegate"]
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
- tools `trae_status, trae_new_chat, trae_delegate`

Then ask OpenClaw something explicit:

- `Use trae_status exactly once and tell me whether Trae is ready.`
- `Use trae_delegate exactly once and ask Trae to summarize this project.`

You can also type directly in the OpenClaw chat box:

- `/Trae Analyze this repository and implement the missing login error state`

The plugin will automatically:

- start or wake TraeAPI
- create a fresh Trae chat
- hand the text after `/Trae` directly to Trae

## 5. Troubleshooting

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
