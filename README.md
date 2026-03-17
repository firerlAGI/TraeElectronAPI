# TraeAPI

[中文](README.md) | [English](README.en.md)

TraeAPI 是一个让 OpenClaw 把 Trae 桌面端当作 IDE 工具来调用的本地桥接服务。

目标链路：

`OpenClaw -> trae_delegate -> TraeAPI -> Trae 桌面端`

这不是模型提供方接入。OpenClaw 继续使用自己的 LLM，TraeAPI 只负责把 Trae 的 IDE 能力暴露为本地工具。

## 适用用户

这个仓库主要面向 OpenClaw 用户，当前支持两条推荐路径：

- Windows 用户
- macOS 用户

如果你只是想直连本地 HTTP API，也仍然支持，但那不是主要使用路径。

## 给 OpenClaw 的安装入口

如果你是让 OpenClaw 帮你安装，优先让它按下面规则执行：

1. 先读 [AGENTS.md](AGENTS.md) 和 [AI_INSTALL.zh-CN.md](AI_INSTALL.zh-CN.md)
2. 如果仓库已经在本地：
   - Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

   - macOS：

```bash
bash ./scripts/install-openclaw-integration.sh
```

3. 如果仓库还不在本地：
   - Windows：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-openclaw-integration.ps1
```

   - macOS：

```bash
bash ./scripts/bootstrap-openclaw-integration.sh
```

4. 安装完成后必须验证：

```powershell
openclaw plugins info trae-ide
openclaw config validate
```

5. 重启 OpenClaw Gateway 后，再测试：

```text
Use trae_status exactly once and tell me whether Trae is ready.
```

可直接复制给 OpenClaw 的提示词见 [docs/openclaw-chat-prompts.zh-CN.md](docs/openclaw-chat-prompts.zh-CN.md)。

## 快速开始

### Windows 一键启动

1. 执行 `npm install`
2. 双击 [start-traeapi.cmd](start-traeapi.cmd)
3. 按 [integrations/openclaw-trae-plugin](integrations/openclaw-trae-plugin/README.md) 加载 OpenClaw 原生插件
4. 重启 OpenClaw Gateway
5. 在 OpenClaw 里让它调用 `trae_delegate`

### macOS 一键启动

1. 执行 `npm install`
2. 双击 [start-traeapi.command](start-traeapi.command)
3. 按 [integrations/openclaw-trae-plugin](integrations/openclaw-trae-plugin/README.md) 加载 OpenClaw 原生插件
4. 重启 OpenClaw Gateway
5. 在 OpenClaw 里让它调用 `trae_delegate`

首次启动时，TraeAPI 会尽量自动完成这些事情：

- 自动生成 `.env`
- 自动识别本地 Trae 可执行文件
- 自动创建默认项目目录
- 优先附着到现有 Trae 窗口
- 如果当前窗口不适合自动化，则自动切到独立 Trae 窗口
- 启动本地 HTTP 网关
- 打开本地聊天页便于排障

如果没有自动找到 Trae，启动器只会问你一次可执行文件路径：

- Windows 可以填 `Trae.exe`
- macOS 可以填 `Trae.app` 或 `Trae.app/Contents/MacOS/Trae`

你也可以直接执行：

```bash
npm run quickstart
```

## 常用本地地址

- 就绪检查：`http://127.0.0.1:8787/ready`
- 排障聊天页：`http://127.0.0.1:8787/chat`

真正的成功标准不是“网关启动了”，而是 OpenClaw 能顺利调用：

- `trae_status`
- `trae_delegate`

## 关键配置

完整配置见 [.env.example](.env.example)。

比较重要的配置项：

- `TRAE_BIN`: Trae 可执行文件路径
  - Windows 例子：`C:\Path\To\Trae.exe`
  - macOS 例子：`/Applications/Trae.app` 或 `/Applications/Trae.app/Contents/MacOS/Trae`
- `TRAE_PROJECT_PATH`: Trae 启动后要打开的项目目录
- `TRAE_REMOTE_DEBUGGING_PORT`: 调试端口
- `TRAE_GATEWAY_TOKEN`: 本地 API Bearer token

## 文档入口

- [AI 安装说明](AI_INSTALL.zh-CN.md)
- [OpenClaw 用户安装指南](docs/install.zh-CN.md)
- [OpenClaw 集成说明](docs/openclaw-integration.zh-CN.md)
- [OpenClaw 对话安装模板](docs/openclaw-chat-prompts.zh-CN.md)
- [插件说明](integrations/openclaw-trae-plugin/README.md)
- [FAQ](docs/faq.zh-CN.md)
- [更新记录](CHANGELOG.md)
- [安全说明](SECURITY.md)

## 高级用法

如果你是高级用户，也可以直接调用本地 HTTP API。接口说明见 [docs/api.md](docs/api.md)。