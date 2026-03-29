# TraeClaw

![Preview](https://img.shields.io/badge/status-preview-orange)

[README 首页](README.md) | [English](README.en.md)

TraeClaw 是一个让 OpenClaw 把 Trae 桌面端当作 IDE 工具来调用的本地桥接服务。

当前 GitHub 主页对应的是预览版发布通道，接口、安装路径和兼容性细节仍可能继续调整。

目标链路：

`OpenClaw -> trae_delegate -> TraeClaw -> Trae 桌面端`

## 当前状态

- 当前仓库发布仍按预览版管理
- 当前优先适配 Trae 国际版
- Trae 国内版插件仍在开发中
- 当前推荐稳定部署平台是 macOS
- Windows 和其他端还在持续开发中，目前不建议当作稳定对外方案

如果你只是想试验本地 HTTP API，也仍然可以，但这不是当前主页推荐路径。

## 给普通用户的一句话

如果你只想尽快用起来，当前最推荐的路径是：

- 用 macOS
- 让 OpenClaw 通过 npm 安装 `traeclaw`
- 然后验证 `trae_status` 和 `trae_delegate`

## 给 OpenClaw 的一句话提示词

把下面这句话直接发给 OpenClaw 即可：

```text
请先阅读 https://github.com/firerlAGI/TraeClaw 仓库里的 AGENTS.md 和 AI_INSTALL.zh-CN.md，然后在 macOS 上通过 npm 安装并启用 traeclaw，验证 openclaw plugins info traeclaw 和 openclaw config validate，提醒我重启 OpenClaw Gateway，再执行一次 trae_status，并告诉我接下来怎么用 trae_delegate。
```

更完整的对话模板见 [docs/openclaw-chat-prompts.zh-CN.md](docs/openclaw-chat-prompts.zh-CN.md)。

## 给 AI 助手的执行入口

如果你是 OpenClaw、Codex 或其他 AI 助手，优先读这些文件：

- [AGENTS.md](AGENTS.md)
- [AI_INSTALL.zh-CN.md](AI_INSTALL.zh-CN.md)
- [OpenClaw 对话安装模板](docs/openclaw-chat-prompts.zh-CN.md)
- [OpenClaw 用户安装指南](docs/install.zh-CN.md)

## 成功标准

真正的成功标准不是“脚本跑完了”，而是下面这些条件成立：

- `openclaw plugins info traeclaw` 成功
- `openclaw config validate` 成功
- OpenClaw 可以调用 `trae_status`
- OpenClaw 可以调用 `trae_delegate`

## 推荐安装路径：npm 包

如果你的目标是给 OpenClaw 用户一个可持续更新的稳定入口，优先使用 npm 包：

```bash
openclaw plugins install traeclaw
openclaw plugins enable traeclaw
openclaw config set plugins.entries.traeclaw.enabled true --strict-json
openclaw config set plugins.entries.traeclaw.config.autoStart true --strict-json
openclaw config set plugins.entries.traeclaw.config.baseUrl "http://127.0.0.1:8787"
openclaw config validate
```

安装后让用户：

1. 重启 OpenClaw Gateway
2. 执行一次 `trae_status`
3. 再执行一次 `trae_delegate`

更新时直接执行：

```bash
openclaw plugins update traeclaw
```

注意：

- npm 包里已经包含 OpenClaw 插件和完整 TraeClaw runtime
- 当前主页推荐的是“安装 npm 包”，不是“手动拷贝本地插件目录”
- 不要让 OpenClaw 执行 `openclaw plugins install <github-url>` 或 git spec

## 如果 npm 安装不适合，再使用本地仓库脚本

只有在下面这些场景里，才建议回退到仓库脚本安装：

- 你在调试源码
- 你需要修改本地 runtime
- 你暂时不想走 npm 包更新链路

如果仓库已经在本地：

- macOS：`bash ./scripts/install-openclaw-integration.sh`
- Windows：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1`

如果仓库还不在本地：

- macOS：`bash ./scripts/bootstrap-openclaw-integration.sh`
- Windows：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-openclaw-integration.ps1`

## 文档入口

- [OpenClaw 用户安装指南](docs/install.zh-CN.md)
- [OpenClaw 集成说明](docs/openclaw-integration.zh-CN.md)
- [OpenClaw 对话安装模板](docs/openclaw-chat-prompts.zh-CN.md)
- [插件说明](integrations/openclaw-trae-plugin/README.md)
- [FAQ](docs/faq.zh-CN.md)
- [更新记录](CHANGELOG.md)
- [安全说明](SECURITY.md)

## 开源协议

本仓库采用 [MIT License](LICENSE)。
