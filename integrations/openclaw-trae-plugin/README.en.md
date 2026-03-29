# OpenClaw Trae Plugin

[English](README.en.md) | [中文](README.md)

This plugin lets OpenClaw use the local Trae desktop app as an IDE tool through TraeClaw.

Target flow:

`OpenClaw -> trae_delegate -> TraeClaw -> Trae desktop app`

This is not a model-provider integration. OpenClaw keeps using its own LLM. The plugin only delegates IDE work to Trae.

## Install For Ongoing Updates

If you want users to receive future plugin updates through OpenClaw, install the npm distribution:

```bash
openclaw plugins install traeclaw
openclaw plugins enable traeclaw
```

After a new version is published, users can update with:

```bash
openclaw plugins update traeclaw
```

Important:

- the npm package now bundles the full TraeClaw runtime
- when users run `openclaw plugins update traeclaw`, the plugin and gateway capabilities update together
- with `autoStart` enabled, the plugin can launch the bundled quickstart entry point without a separate local checkout

## Exposed Tools

- `trae_status`
- `trae_new_chat`
- `trae_delegate`

## Slash Command

- `/Trae <task>`
- `/Trae process <task>`

Type `/Trae` directly in the OpenClaw chat box. The plugin will:

1. Ensure TraeClaw is running
2. Create a fresh Trae chat
3. Delegate the task text after `/Trae` directly to Trae
4. Return only Trae's final reply by default

Use `/Trae process <task>` when you also want the process trace.

Example:

```text
/Trae Analyze this repository and implement the missing login error state.
```

```text
/Trae process Analyze this repository and return the execution trace too.
```

## Recommended Setup

1. Start TraeClaw first.
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
