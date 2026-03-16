# OpenClaw Trae IDE Plugin

This plugin lets OpenClaw use the local Trae desktop app as an IDE tool through TraeAPI.

For an end-to-end setup and troubleshooting guide, see [../../docs/openclaw-integration.md](../../docs/openclaw-integration.md).

Target flow:

`OpenClaw agent -> trae_delegate tool -> TraeAPI -> Trae desktop`

This is not a model provider plugin. OpenClaw keeps using its own configured LLM. The plugin only gives the agent a way to delegate IDE work to Trae.

## What It Adds

- `trae_status`
  - Checks whether the local TraeAPI bridge is reachable and ready.
- `trae_delegate`
  - Optional tool that sends an IDE task to Trae through `POST /v1/chat`.
  - Returns the final reply plus collected process text when available.

## Install

You have two practical ways to load the plugin.

### Option A: Load directly from this repository

This is the simplest path while TraeAPI and the plugin live in the same checkout.

Add the plugin directory to `plugins.load.paths`:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "E:\\tiy\\chajian2\\integrations\\openclaw-trae-plugin"
      ]
    },
    "entries": {
      "trae-ide": {
        "enabled": true
      }
    }
  }
}
```

In this mode, the plugin can infer the bundled `start-traeapi.cmd` path automatically.

### Option B: Install the plugin into OpenClaw

If you prefer OpenClaw-managed installation:

```bash
openclaw plugins install E:\tiy\chajian2\integrations\openclaw-trae-plugin
```

Restart the OpenClaw Gateway afterwards.

In this mode, set `quickstartCommand` explicitly because the plugin is no longer running from the repository path.

## Configure

Add or update the plugin entry in your OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "trae-ide": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "autoStart": true,
          "quickstartCommand": "E:\\tiy\\chajian2\\start-traeapi.cmd",
          "quickstartCwd": "E:\\tiy\\chajian2"
        }
      }
    }
  }
}
```

If your TraeAPI gateway uses Bearer auth, also set:

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

## Enable The Tool For Agents

`trae_delegate` is optional because it can trigger IDE actions and code changes. Enable it additively per agent or globally.

Important: if your OpenClaw config already uses a restrictive tool profile or `tools.allow`, prefer `tools.alsoAllow` for this plugin. OpenClaw strips plugin-only `allow` lists to avoid hiding core tools, so `allow: ["trae_delegate"]` can look correct while still failing to expose the plugin tool to the agent.

Per-agent example:

```json
{
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

If you prefer to enable all tools from this plugin globally:

```json
{
  "tools": {
    "alsoAllow": ["trae-ide"]
  }
}
```

`trae_status` is registered as a normal tool, but if you use explicit tool policy you should still include it in `alsoAllow` so the agent definitely sees it.

## Example Prompts

- `Use Trae to inspect this project and summarize the main architecture.`
- `Use Trae to implement the requested fix and tell me what changed.`
- `Check Trae status first, then delegate this IDE task to Trae.`

## Operational Notes

- The plugin expects TraeAPI to be reachable on the same machine as the OpenClaw Gateway.
- `autoStart` is optional. When enabled, the plugin will run `quickstartCommand` and wait for `/ready`.
- If you load the plugin directly from this repository with `plugins.load.paths`, `quickstartCommand` can usually be omitted.
- The plugin returns Trae process text when the gateway exposes `result.chunks`.
- The active project is still controlled by TraeAPI and the Trae window it launches or attaches to.
