# OpenClaw Integration Guide

This guide is for users who want OpenClaw to use Trae as an IDE tool through TraeClaw.

Target flow:

`OpenClaw agent -> trae_delegate -> TraeClaw -> Trae desktop`

This is not a model-provider integration. OpenClaw keeps using its own configured LLM. Trae is exposed as a callable IDE tool.

## Prerequisites

- Windows or macOS with Trae installed.
- A working OpenClaw installation.
- This repository available locally.
- Trae must be able to start with `--remote-debugging-port=<port>`.

## 1. Start TraeClaw

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
        "/path/to/TraeClaw/integrations/openclaw-trae-plugin"
      ]
    },
    "entries": {
      "traeclaw": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "autoStart": true,
          "quickstartCommand": "\"/path/to/TraeClaw/start-traeapi.command\"",
          "quickstartCwd": "/path/to/TraeClaw"
        }
      }
    }
  }
}
```

Windows users can keep using `"C:\path\to\TraeClaw\start-traeapi.cmd"` as the `quickstartCommand`. Keep the outer quotes if the path may contain spaces.

If your gateway uses a bearer token, also set:

```json
{
  "plugins": {
    "entries": {
      "traeclaw": {
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

## 2.1 npm Distribution Install

If you want users to receive plugin updates directly through OpenClaw later, install the npm distribution:

```bash
openclaw plugins install traeclaw
openclaw plugins enable traeclaw
```

Then set at least these values:

```bash
openclaw config set plugins.entries.traeclaw.enabled true --strict-json
openclaw config set plugins.entries.traeclaw.config.baseUrl "http://127.0.0.1:8787"
openclaw config set plugins.entries.traeclaw.config.autoStart true --strict-json
openclaw config validate
```

Users update later with:

```bash
openclaw plugins update traeclaw
```

Important:

- the npm package now bundles the full TraeClaw runtime
- when users run `openclaw plugins update traeclaw`, the plugin and gateway capabilities update together
- if you explicitly configure `quickstartCommand`, it overrides the bundled runtime launcher

## 2.2 Dev Hot Plugin Directory

While developing the plugin, do not point OpenClaw directly at the source directory:

- do not load `integrations/openclaw-trae-plugin` directly

Instead, generate a separate local hot plugin directory:

```bash
npm run dev:plugin-hot
```

For continuous development:

```bash
npm run dev:plugin-hot:watch
```

The script generates:

- hot plugin dir: `.runtime/openclaw-plugin-hot/traeclaw`
- OpenClaw dev config template: `.runtime/openclaw-plugin-hot/openclaw.dev.config.json`

This keeps the roles clear:

- development source dir: `integrations/openclaw-trae-plugin`
- OpenClaw runtime load dir: `.runtime/openclaw-plugin-hot/traeclaw`

Notes:

- OpenClaw should load the hot plugin dir, not the source dir
- `quickstartCommand` and `quickstartCwd` should still point at the development repository root
- if the OpenClaw host does not auto-reload plugin code, restart OpenClaw Gateway after sync

## 3. Enable The Tools Correctly

Use `alsoAllow`, not a plugin-only `allow` list.

Recommended:

```json
{
  "tools": {
    "alsoAllow": ["traeclaw"]
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
openclaw plugins info traeclaw
```

You should see:

- plugin status `loaded`
- tools `trae_status, trae_new_chat, trae_delegate`

Then ask OpenClaw something explicit:

- `Use trae_status exactly once and tell me whether Trae is ready.`
- `Use trae_delegate exactly once and ask Trae to summarize this project.`

You can also type directly in the OpenClaw chat box:

- `/Trae Analyze this repository and implement the missing login error state`
- `/Trae process Analyze this repository and return the execution trace too`

The plugin will automatically:

- start or wake TraeClaw
- create a fresh Trae chat
- hand the text after `/Trae` directly to Trae

By default, OpenClaw only receives Trae's final reply.

The process trace is included only when you use `/Trae process ...`.

## 5. Troubleshooting

`trae_status` or `trae_delegate` does not appear inside the agent

- Confirm the plugin loads with `openclaw plugins info traeclaw`
- Replace plugin-only `tools.allow` with `tools.alsoAllow`
- Restart the OpenClaw Gateway after config changes

`/ready` is false

- TraeClaw can reach Trae, but the current Trae page is not automation-ready
- The easiest recovery is usually:
  1. close running Trae windows
  2. start TraeClaw again
  3. let it relaunch Trae with remote debugging

Trae opens but still lands on the wrong screen

- Make sure Trae is logged in
- Make sure a project is open
- Run `npm run inspect:trae` to inspect selectors and page state
