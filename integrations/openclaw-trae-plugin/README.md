# OpenClaw Trae Plugin

This plugin lets OpenClaw use the local Trae desktop app as an IDE tool through TraeAPI.

Target flow:

`OpenClaw -> trae_delegate -> TraeAPI -> Trae desktop app`

This is not a model-provider integration. OpenClaw keeps using its own LLM. The plugin only delegates IDE work to Trae.

## What It Exposes

The plugin registers two tools inside OpenClaw:

- `trae_status`
- `trae_delegate`

`trae_status` checks whether the local TraeAPI service is reachable and ready.

`trae_delegate` sends a task to TraeAPI so Trae can work on it inside the desktop IDE.

## Recommended Setup

1. Start TraeAPI first.
2. Load this plugin from a local path in OpenClaw.
3. Add the plugin tools through `tools.alsoAllow`.
4. Restart OpenClaw Gateway.
5. Ask OpenClaw to use `trae_status` or `trae_delegate`.

Full user-facing guides:

- [Install Guide](../../docs/install.md)
- [FAQ](../../docs/faq.md)
- [OpenClaw Integration Guide](../../docs/openclaw-integration.md)

## Minimal OpenClaw Config

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
  },
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

You can also start from:

- [openclaw.config.example.json](examples/openclaw.config.example.json)
- [openclaw.minimal.config.json](examples/openclaw.minimal.config.json)

## Token-Protected Gateway

If TraeAPI uses `TRAE_GATEWAY_TOKEN`, add `token` in the plugin config:

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

## Important Tool Policy Note

Use `tools.alsoAllow` or `agents.list[].tools.alsoAllow`.

Do not rely on a plugin-only `tools.allow` entry. OpenClaw may show the plugin in the catalog while still blocking agent tool use unless the plugin tools are added through `alsoAllow`.

## Quick Validation

After OpenClaw restarts:

1. Confirm the plugin is loaded.
2. Ask OpenClaw: `Use trae_status exactly once and tell me whether Trae is ready.`
3. Ask OpenClaw: `Use trae_delegate exactly once and ask Trae to summarize this project.`

## Troubleshooting

OpenClaw can see the plugin but cannot call `trae_delegate`

- Check `tools.alsoAllow`
- Restart OpenClaw Gateway
- Confirm TraeAPI is ready at `http://127.0.0.1:8787/ready`

TraeAPI is up but not ready

- Make sure Trae is installed and logged in
- Make sure Trae can open a project
- Run `npm run inspect:trae`

Trae opens a dedicated window

- This is expected when the current Trae window is not automation-ready
- The dedicated window keeps the bridge more stable
