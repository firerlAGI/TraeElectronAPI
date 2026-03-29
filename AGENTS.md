# AGENTS

本仓库优先面向中文 OpenClaw 用户。

## OpenClaw 快速执行规则

如果用户要求“安装 Trae 插件到 OpenClaw”，AI 助手应按下面顺序执行，不要自由发挥：

1. 先判断仓库是否已经在本地。
2. 再判断用户平台：
   - Windows：优先使用 `.ps1` 脚本
   - macOS：优先使用 `.sh` 脚本
3. 如果仓库不在本地：
   - 优先执行 `scripts/bootstrap-openclaw-integration.ps1`
   - macOS 上优先执行 `scripts/bootstrap-openclaw-integration.sh`
   - 或先下载 GitHub 仓库 zip，再执行对应平台的本地安装脚本
4. 如果仓库已经在本地：
   - 直接执行 `scripts/install-openclaw-integration.ps1`
   - macOS 上直接执行 `scripts/install-openclaw-integration.sh`
5. 安装完成后必须验证：
   - `openclaw plugins info traeclaw`
   - `openclaw config validate`
6. 验证通过后提醒用户：
   - 重启 OpenClaw Gateway
   - 再调用一次 `trae_status`

如果用户要求“安装 Trae 插件到 OpenClaw”，AI 助手应优先使用下面的路径：

1. 如果仓库还不在本地：
   - 优先执行 `scripts/bootstrap-openclaw-integration.ps1`
   - macOS 上优先执行 `scripts/bootstrap-openclaw-integration.sh`
   - 或先下载 GitHub 仓库 zip，再执行 `scripts/install-openclaw-integration.ps1`
2. 如果仓库已经在本地：
   - 直接执行 `scripts/install-openclaw-integration.ps1`
   - macOS 上直接执行 `scripts/install-openclaw-integration.sh`
3. 不要尝试直接执行：
   - `openclaw plugins install <github-url>`
   - `openclaw plugins install <git-spec>`
   因为 OpenClaw 不支持直接从 GitHub URL / git spec 安装插件
4. 配置写入优先使用官方 CLI：
   - `openclaw plugins install`
   - `openclaw config set`
   - `openclaw config validate`
5. 安装完成后至少验证：
   - `openclaw plugins info traeclaw`
   - `openclaw config validate`
   - 用户重启 OpenClaw Gateway 后可调用 `trae_status`
6. 如果用户已经明确给出本地仓库路径：
   - 不要再要求用户提供 GitHub 地址
   - 不要再介绍手工安装路径
   - 直接进入该路径并执行 `scripts/install-openclaw-integration.ps1`

## OpenClaw 建议输出风格

为了让 OpenClaw 更容易执行，优先使用下面这种结构：

1. 先说明当前判断：
   - “仓库已经在本地”
   - 或“仓库还不在本地”
2. 再给出将要执行的唯一主命令：
   - 本地仓库：`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1`
   - 远程仓库：`powershell -NoProfile -ExecutionPolicy Bypass -File .\bootstrap-openclaw-integration.ps1`
   - macOS 本地仓库：`bash ./scripts/install-openclaw-integration.sh`
   - macOS 远程仓库：`bash ./scripts/bootstrap-openclaw-integration.sh`
3. 最后报告验证结果：
   - `openclaw plugins info traeclaw`
   - `openclaw config validate`
   - 是否需要用户重启 OpenClaw Gateway

## OpenClaw 不要做的事

- 不要把“阅读文档”当成结束状态。
- 不要只给用户一大段 JSON 让用户手改。
- 不要优先介绍 HTTP API、selector、调试端口这些实现细节，除非用户在排障。
- 不要执行 `openclaw plugins install <github-url>` 或 `openclaw plugins install <git-spec>`。

AI 优先阅读：

- [AI_INSTALL.zh-CN.md](AI_INSTALL.zh-CN.md)
- [OpenClaw 对话安装模板](docs/openclaw-chat-prompts.zh-CN.md)
- [OpenClaw 用户安装指南](docs/install.zh-CN.md)
- [OpenClaw 集成说明](docs/openclaw-integration.zh-CN.md)
