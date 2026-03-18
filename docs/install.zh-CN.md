# OpenClaw 用户安装指南

这份说明假设你的目标是让 OpenClaw 通过 TraeAPI 把 Trae 当成 IDE 工具来调用。

## 推荐路径

对于大多数 Windows 或 macOS 用户，推荐这样安装：

1. 安装 Node.js 22 或更高版本。
2. 克隆或下载本仓库。
3. 执行 `npm install`。
4. 启动 TraeAPI：
   - Windows：双击 [start-traeapi.cmd](../start-traeapi.cmd)
   - macOS：双击 [start-traeapi.command](../start-traeapi.command)
5. 按 [../integrations/openclaw-trae-plugin](../integrations/openclaw-trae-plugin/README.md) 把插件加载进 OpenClaw。
6. 重启 OpenClaw Gateway。
7. 在 OpenClaw 里调用 `trae_status` 或 `trae_delegate`。

首次启动时，TraeAPI 会尽量自动完成这些事：

- 根据 [`.env.example`](../.env.example) 创建 `.env`
- 自动识别本地 Trae 可执行文件
- 如果还没配置工作目录，就自动创建一个本地项目目录
- 优先附着到当前已打开的 Trae 窗口
- 如果当前窗口不适合自动化，就切到独立 Trae 窗口
- 启动本地 HTTP 网关
- 自动打开内置聊天页，方便排障

## 一步安装 OpenClaw 插件

如果仓库已经在本地，优先用官方 CLI 和仓库脚本：

- Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

- macOS：

```bash
bash ./scripts/install-openclaw-integration.sh
```

如果仓库还不在本地，优先用 bootstrap 脚本：

- Windows：`scripts/bootstrap-openclaw-integration.ps1`
- macOS：`scripts/bootstrap-openclaw-integration.sh`

## 持续更新版安装

如果你的目标是让用户后续直接通过 OpenClaw 收插件更新，推荐把插件作为 npm 包安装：

```bash
openclaw plugins install traeelectronapi
openclaw plugins enable trae-ide
```

发布新版本后，用户更新：

```bash
openclaw plugins update trae-ide
```

要注意两点：

- 这个 npm 包会同时分发 OpenClaw 插件和完整 TraeAPI runtime
- 用户执行 `openclaw plugins update trae-ide` 时，插件和网关能力会一起更新

如果希望插件自动拉起包内 runtime，再补上：

```bash
openclaw config set plugins.entries.trae-ide.enabled true --strict-json
openclaw config set plugins.entries.trae-ide.config.autoStart true --strict-json
openclaw config set plugins.entries.trae-ide.config.baseUrl "http://127.0.0.1:8787"
openclaw config validate
```

## 开始前请确认

请确认：

- 本机已经安装 Trae。
- Trae 支持 `--remote-debugging-port=<port>`。
- 你至少完成过一次 Trae 登录。
- 本机可以打开本地浏览器页面。
- 本机有可用的 OpenClaw。

## 验证安装是否成功

启动成功后，打开：

- 健康检查：`http://127.0.0.1:8787/health`
- 就绪检查：`http://127.0.0.1:8787/ready`
- 排障聊天页：`http://127.0.0.1:8787/chat`

然后在 OpenClaw 里验证：

- 确认插件已经加载
- 确认 `tools.alsoAllow` 已放行插件工具
- 让 OpenClaw 执行：`Use trae_status exactly once and tell me whether Trae is ready.`
- 再让 OpenClaw 执行：`Use trae_delegate exactly once and ask Trae to summarize this project.`

## 手动配置

如果一键启动还不够：

1. 把 [`.env.example`](../.env.example) 复制成 `.env`。
2. 设置 `TRAE_BIN` 为本机的 Trae 可执行文件路径。
   - Windows 例子：`C:\Path\To\Trae.exe`
   - macOS 例子：`/Applications/Trae.app` 或 `/Applications/Trae.app/Contents/MacOS/Trae`
3. 按需设置 `TRAE_PROJECT_PATH`。
4. 运行：

```bash
npm run quickstart
```

## OpenClaw 配置

完整插件接入步骤见：

- [OpenClaw 集成](openclaw-integration.zh-CN.md)

## 相关文档

- [插件说明](../integrations/openclaw-trae-plugin/README.md)
- [常见问题](faq.zh-CN.md)
- [API 参考](api.md)
- [OpenAPI JSON](openapi.json)
- [OpenAPI YAML](openapi.yaml)
