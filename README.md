# TraeAPI

[中文](README.md) | [English](README.en.md)

TraeAPI 是一个让 OpenClaw 调用 Trae 桌面端作为 IDE 工具的本地桥接服务。

目标链路：

`OpenClaw -> trae_delegate -> TraeAPI -> Trae 桌面端`

这不是模型接入层。OpenClaw 继续使用自己的 LLM，TraeAPI 只负责把 IDE 能力桥接给 OpenClaw。

## 适用人群

这个仓库现在主要面向中文 OpenClaw 用户。

如果你只是想直接调用本地 HTTP API，也仍然支持，但那不是主要产品路径。

## 最短上手路径

1. 安装 `Node.js 22+`
2. 执行 `npm install`
3. 双击 [start-traeapi.cmd](start-traeapi.cmd)
4. 在 OpenClaw 里加载 [openclaw-trae-plugin](integrations/openclaw-trae-plugin/README.md)
5. 重启 OpenClaw Gateway
6. 在 OpenClaw 里调用 `trae_status` 或 `trae_delegate`

首次启动时，TraeAPI 会尽量自动完成这些事：

- 自动生成 `.env`
- 自动识别 `Trae.exe`
- 自动创建默认项目目录
- 优先附着已有 Trae 窗口
- 不可自动化时自动拉起独立 Trae 窗口
- 启动本地网关
- 自动打开排障聊天页

## 用户最关心的两个地址

- 就绪检查：`http://127.0.0.1:8787/ready`
- 排障聊天页：`http://127.0.0.1:8787/chat`

真正的成功标准不是“网关启动了”，而是 OpenClaw 能顺利调用：

- `trae_status`
- `trae_delegate`

## 文档入口

- [AI 安装说明](AI_INSTALL.zh-CN.md)
- [OpenClaw 用户安装指南](docs/install.zh-CN.md)
- [OpenClaw 集成说明](docs/openclaw-integration.zh-CN.md)
- [常见问题](docs/faq.zh-CN.md)
- [插件说明](integrations/openclaw-trae-plugin/README.md)
- [更新记录](CHANGELOG.md)
- [安全说明](SECURITY.md)

## 高级用法

如果你是高级用户，或者只是为了排障，也可以直接调用本地 HTTP API：

- `GET /health`
- `GET /ready`
- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/sessions`
- `POST /v1/sessions/{sessionId}/messages`

完整接口见 [docs/api.md](docs/api.md)。

## 说明

- 这套桥接基于 `CDP + DOM 自动化`，不是 Trae 官方 API。
- Trae 更新后，selector 可能需要调整。
- 单个 Trae 窗口本质上仍然是串行执行。
