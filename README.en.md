# TraeAPI

[English](README.en.md) | [中文](README.md)

TraeAPI is a local bridge that lets OpenClaw use the Trae desktop app as an IDE tool.

Target flow:

`OpenClaw -> trae_delegate -> TraeAPI -> Trae desktop app`

This is not a model-provider integration. OpenClaw keeps using its own LLM. TraeAPI only exposes Trae IDE capabilities locally.

## Primary Audience

This repository is mainly optimized for OpenClaw users who want a local Trae bridge with the shortest possible setup path.

## Shortest Setup Path

1. Install `Node.js 22+`
2. Run `npm install`
3. Start TraeAPI:
   - Windows: double-click [start-traeapi.cmd](start-traeapi.cmd)
   - macOS: double-click [start-traeapi.command](start-traeapi.command)
4. Load the [openclaw-trae-plugin](integrations/openclaw-trae-plugin/README.en.md) in OpenClaw
5. Restart OpenClaw Gateway
6. Ask OpenClaw to call `trae_status` or `trae_delegate`

On first launch, TraeAPI will try to:

- create `.env` from [`.env.example`](.env.example)
- detect the local Trae executable automatically
- create a local workspace folder if none is configured
- attach to your existing Trae window first
- fall back to a dedicated Trae window when the current one is not automation-ready
- start the local HTTP gateway
- open the built-in chat page for diagnostics

If auto-detection does not find Trae, quickstart will ask once for the local executable path. On macOS you can also point `TRAE_BIN` at `Trae.app`.

## Important Local URLs

- Ready check: `http://127.0.0.1:8787/ready`
- Diagnostic chat page: `http://127.0.0.1:8787/chat`

The real success condition is not just "the gateway is up". It is that OpenClaw can successfully call:

- `trae_status`
- `trae_delegate`

## Docs

- [AI Install Guide (Chinese)](AI_INSTALL.zh-CN.md)
- [Install Guide](docs/install.md)
- [OpenClaw Integration Guide](docs/openclaw-integration.md)
- [FAQ](docs/faq.md)
- [Plugin README](integrations/openclaw-trae-plugin/README.en.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)

## Advanced Usage

Direct local HTTP API usage is still available for advanced users and debugging. See [docs/api.md](docs/api.md).