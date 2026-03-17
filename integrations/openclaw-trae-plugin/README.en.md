# OpenClaw Trae Plugin

[English](README.en.md) | [中文](README.md)

This plugin lets OpenClaw use the local Trae desktop app as an IDE tool through TraeAPI.

Target flow:

`OpenClaw -> trae_delegate -> TraeAPI -> Trae desktop app`

This is not a model-provider integration. OpenClaw keeps using its own LLM. The plugin only delegates IDE work to Trae.

## Exposed Tools

- `trae_status`
- `trae_new_chat`
- `trae_delegate`

## Slash Command

- `/Trae <task>`

Type `/Trae` directly in the OpenClaw chat box. The plugin will:

1. Ensure TraeAPI is running
2. Create a fresh Trae chat
3. Delegate the task text after `/Trae` directly to Trae

Example:

```text
/Trae Analyze this repository and implement the missing login error state.
```

## Recommended Setup

1. Start TraeAPI first.
   - Windows: `start-traeapi.cmd`
   - macOS: `start-traeapi.command`
2. Load this plugin from a local path in OpenClaw.
3. Add the plugin tools through `tools.alsoAllow`.
4. Restart OpenClaw Gateway.
5. Ask OpenClaw to use `trae_status`, `trae_new_chat`, or `trae_delegate`.

If `autoStart` is enabled, the plugin can launch the bundled quickstart entry point automatically. On macOS that means `start-traeapi.command` when the repository is available locally.

More docs:

- [Install Guide](../../docs/install.md)
- [OpenClaw Integration Guide](../../docs/openclaw-integration.md)
- [FAQ](../../docs/faq.md)

## Example Configs

- [Full example](examples/openclaw.config.example.json)
- [Minimal example](examples/openclaw.minimal.config.json)

## Important Note

Use `tools.alsoAllow` or `agents.list[].tools.alsoAllow`.

Do not rely on a plugin-only `tools.allow` entry.
