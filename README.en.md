# TraeClaw

![Preview](https://img.shields.io/badge/status-preview-orange)

[Chinese Home](README.md) | [Chinese Mirror](README.zh-CN.md)

TraeClaw is a local bridge that lets OpenClaw use the Trae desktop app as an IDE tool.

The GitHub homepage currently tracks a preview release channel. Interfaces, install paths, and compatibility details may still change.

Target flow:

`OpenClaw -> trae_delegate -> TraeClaw -> Trae desktop app`

## Current Status

- Repository releases are currently managed as preview builds
- The current priority target is the Trae international edition
- Support for the Trae China plugin is still under development
- macOS is the recommended stable deployment platform today
- Windows and other platforms are still under active development and should not be treated as stable public deployment targets yet

Direct local HTTP API usage is still available for experiments, but it is no longer the primary path recommended on the homepage.

## One-Line Guidance For Users

If you just want the shortest working path, the recommended flow today is:

- use macOS
- let OpenClaw install `traeclaw` from npm
- then verify `trae_status` and `trae_delegate`

## One-Line Prompt For OpenClaw

You can paste the following sentence directly into OpenClaw:

```text
Please read AGENTS.md and AI_INSTALL.zh-CN.md from https://github.com/firerlAGI/TraeClaw first, then install and enable traeclaw from npm on macOS, verify openclaw plugins info traeclaw and openclaw config validate, remind me to restart OpenClaw Gateway, run trae_status once, and then tell me how to use trae_delegate next.
```

For a longer Chinese conversation template, see [docs/openclaw-chat-prompts.zh-CN.md](docs/openclaw-chat-prompts.zh-CN.md).

## Entry Points For AI Assistants

If the executor is OpenClaw, Codex, or another AI assistant, start with:

- [AGENTS.md](AGENTS.md)
- [AI_INSTALL.zh-CN.md](AI_INSTALL.zh-CN.md)
- [OpenClaw Chat Install Prompts](docs/openclaw-chat-prompts.zh-CN.md)
- [OpenClaw Install Guide](docs/install.md)

## Success Criteria

Success is not "a script finished". Success means all of the following are true:

- `openclaw plugins info traeclaw` succeeds
- `openclaw config validate` succeeds
- OpenClaw can call `trae_status`
- OpenClaw can call `trae_delegate`

## Recommended Install Path: npm Package

If you want a stable, update-friendly installation path for OpenClaw users, prefer the npm package:

```bash
openclaw plugins install traeclaw
openclaw plugins enable traeclaw
openclaw config set plugins.entries.traeclaw.enabled true --strict-json
openclaw config set plugins.entries.traeclaw.config.autoStart true --strict-json
openclaw config set plugins.entries.traeclaw.config.baseUrl "http://127.0.0.1:8787"
openclaw config validate
```

After installation, ask the user to:

1. restart OpenClaw Gateway
2. run `trae_status` once
3. run `trae_delegate` once

Update later with:

```bash
openclaw plugins update traeclaw
```

Notes:

- the npm package already bundles the OpenClaw plugin and the full TraeClaw runtime
- the homepage now recommends the npm package, not manual plugin-directory copying
- do not ask OpenClaw to run `openclaw plugins install <github-url>` or a git spec

## If npm Is Not Suitable, Fall Back To Local Repo Scripts

Only use the repository scripts when:

- you are debugging source code
- you need to modify the local runtime
- you do not want to use the npm-based update path yet

If the repository is already local:

- macOS: `bash ./scripts/install-openclaw-integration.sh`
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1`

If the repository is not local yet:

- macOS: `bash ./scripts/bootstrap-openclaw-integration.sh`
- Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-openclaw-integration.ps1`

## Documentation

- [OpenClaw Install Guide](docs/install.md)
- [OpenClaw Integration Guide](docs/openclaw-integration.md)
- [OpenClaw Chat Install Prompts](docs/openclaw-chat-prompts.zh-CN.md)
- [Plugin README](integrations/openclaw-trae-plugin/README.en.md)
- [FAQ](docs/faq.md)
- [Changelog](CHANGELOG.md)
- [Security Policy](SECURITY.md)

## License

This repository is licensed under the [MIT License](LICENSE).
