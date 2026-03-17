# AGENTS

本仓库优先面向中文 OpenClaw 用户。

如果用户要求“安装 Trae 插件到 OpenClaw”，AI 助手应优先使用下面的路径：

1. 如果仓库还不在本地：
   - 优先执行 `scripts/bootstrap-openclaw-integration.ps1`
   - 或先下载 GitHub 仓库 zip，再执行 `scripts/install-openclaw-integration.ps1`
2. 如果仓库已经在本地：
   - 直接执行 `scripts/install-openclaw-integration.ps1`
3. 不要尝试直接执行：
   - `openclaw plugins install <github-url>`
   - `openclaw plugins install <git-spec>`
   因为 OpenClaw 不支持直接从 GitHub URL / git spec 安装插件
4. 配置写入优先使用官方 CLI：
   - `openclaw plugins install`
   - `openclaw config set`
   - `openclaw config validate`
5. 安装完成后至少验证：
   - `openclaw plugins info trae-ide`
   - `openclaw config validate`
   - 用户重启 OpenClaw Gateway 后可调用 `trae_status`

AI 优先阅读：

- [AI_INSTALL.zh-CN.md](AI_INSTALL.zh-CN.md)
- [OpenClaw 对话安装模板](docs/openclaw-chat-prompts.zh-CN.md)
- [OpenClaw 用户安装指南](docs/install.zh-CN.md)
- [OpenClaw 集成说明](docs/openclaw-integration.zh-CN.md)
