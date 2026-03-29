# Install Guide for OpenClaw Users

This guide assumes your goal is to let OpenClaw call Trae as an IDE tool through TraeClaw.

## Recommended Path

For most OpenClaw users on Windows or macOS, the intended setup is:

1. Install Node.js 22 or newer.
2. Clone or download this repository.
3. Run `npm install`.
4. Start TraeClaw:
   - Windows: double-click [start-traeapi.cmd](../start-traeapi.cmd)
   - macOS: double-click [start-traeapi.command](../start-traeapi.command)
5. Load the plugin from [../integrations/openclaw-trae-plugin](../integrations/openclaw-trae-plugin/README.en.md) in OpenClaw.
6. Restart OpenClaw Gateway.
7. Ask OpenClaw to call `trae_status` or `trae_delegate`.

On first launch, TraeClaw will try to:

- create `.env` from [`.env.example`](../.env.example)
- detect the local Trae executable automatically
- create a local workspace folder if none is configured
- attach to your existing Trae window first
- fall back to a dedicated Trae window when the current one is not automation-ready
- start the local HTTP gateway
- open the built-in chat page for diagnostics

## One-Step Plugin Install

If the repository is already local and you want OpenClaw integration with the official CLI, use the platform-specific installer script:

- Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

- macOS:

```bash
bash ./scripts/install-openclaw-integration.sh
```

If the repository is not local yet, use the bootstrap script instead:

- Windows: `scripts/bootstrap-openclaw-integration.ps1`
- macOS: `scripts/bootstrap-openclaw-integration.sh`

## Install For Ongoing Updates

If you want users to receive plugin updates directly through OpenClaw later, install the npm package:

```bash
openclaw plugins install traeclaw
openclaw plugins enable traeclaw
```

When a new version is published, users update with:

```bash
openclaw plugins update traeclaw
```

Two important constraints:

- the npm package now ships both the OpenClaw plugin and the full TraeClaw runtime
- when users run `openclaw plugins update traeclaw`, the plugin and gateway capabilities update together

To let the plugin auto-start the bundled runtime, also set:

```bash
openclaw config set plugins.entries.traeclaw.enabled true --strict-json
openclaw config set plugins.entries.traeclaw.config.autoStart true --strict-json
openclaw config set plugins.entries.traeclaw.config.baseUrl "http://127.0.0.1:8787"
openclaw config validate
```

## Before You Start

Make sure:

- Trae is installed on the machine.
- Trae supports `--remote-debugging-port=<port>`.
- You can sign in to Trae at least once.
- The machine can open a local browser page.
- You have a working local OpenClaw installation.

## Verify the Installation

After startup succeeds, open:

- Health check: `http://127.0.0.1:8787/health`
- Ready check: `http://127.0.0.1:8787/ready`
- Chat page for diagnostics: `http://127.0.0.1:8787/chat`

Then validate from OpenClaw:

- Make sure the plugin is loaded.
- Make sure `tools.alsoAllow` includes the plugin tools.
- Ask OpenClaw: `Use trae_status exactly once and tell me whether Trae is ready.`
- Ask OpenClaw: `Use trae_delegate exactly once and ask Trae to summarize this project.`

Direct API testing is optional and mainly useful for debugging:

```bash
curl -X POST http://127.0.0.1:8787/v1/chat \
  -H "content-type: application/json" \
  -d '{"content":"Reply with exactly: OK"}'
```

If the gateway is ready, you should receive a JSON response with Trae output.

## Manual Setup

If one-click startup is not enough:

1. Copy [`.env.example`](../.env.example) to `.env`.
2. Set `TRAE_BIN` to your local Trae executable path.
   - Windows example: `C:\Path\To\Trae.exe`
   - macOS example: `/Applications/Trae.app` or `/Applications/Trae.app/Contents/MacOS/Trae`
3. Optionally set a fixed `TRAE_PROJECT_PATH`.
4. Run:

```bash
npm run quickstart
```

## OpenClaw Setup

Use the full plugin walkthrough here:

- [OpenClaw Integration](openclaw-integration.md)

## Related Docs

- [Plugin README](../integrations/openclaw-trae-plugin/README.en.md)
- [FAQ](faq.md)
- [API Reference](api.md)
- [OpenAPI JSON](openapi.json)
- [OpenAPI YAML](openapi.yaml)
