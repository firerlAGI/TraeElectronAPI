# TraeAPI

[English](README.md) | [中文](README.zh-CN.md)

TraeAPI 是一个给 Trae 桌面版使用的本地 HTTP 桥接服务。

它通过 Chrome DevTools Protocol 连接 Trae 的 Electron 渲染窗口，用 DOM selector 驱动界面，并把能力暴露成稳定的本地 API，供其他工具调用。

这是一层本地桌面桥接，不是官方 Trae API。

## 快速开始

### Windows 一键启动

如果你在 Windows 上使用，推荐直接这样启动：

1. 双击 [start-traeapi.cmd](start-traeapi.cmd)

首次启动时，TraeAPI 会自动完成这些事情：

- 如果没有 `.env`，就从 [.env.example](.env.example) 自动生成
- 尽量自动识别 `Trae.exe`
- 如果你还没配置项目目录，就自动创建一个本地工作目录
- 先尝试附着到你当前已经打开的 Trae 窗口
- 如果当前窗口不适合自动化，就自动拉起一个专用 Trae 窗口
- 启动本地网关服务
- 自动打开内置聊天页面

如果没有自动找到 Trae，启动器只会问你一次 `Trae.exe` 路径，并把结果保存到 `.env`。

你也可以在终端里执行同样的流程：

```bash
npm run quickstart
```

启动成功后，常用入口是：

- 聊天页面：`http://127.0.0.1:8787/chat`
- API 基地址：`http://127.0.0.1:8787`

## 用户只需要知道的事

- TraeAPI 运行在你的本机上。
- Trae 需要支持 `--remote-debugging-port=<port>`。
- TraeAPI 会让 Trae 打开一个项目目录；如果你没配，它会自动创建默认工作目录。
- 如果当前 Trae 窗口不适合自动化，quickstart 会自动切到一个独立 profile 的 Trae 窗口，用户不需要自己理解端口或 Chromium profile。

## 对外 API

当前稳定暴露的本地接口：

- `GET /health`
- `GET /ready`
- `GET /openapi.json`
- `GET /openapi.yaml`
- `POST /v1/chat`
- `POST /v1/chat/stream`
- `POST /v1/sessions`
- `GET /v1/sessions/{sessionId}`
- `POST /v1/sessions/{sessionId}/messages`
- `POST /v1/sessions/{sessionId}/messages/stream`

完整请求和响应格式见 [docs/api.md](docs/api.md)。

运行时和仓库内都提供 OpenAPI 文件：

- [docs/openapi.json](docs/openapi.json)
- [docs/openapi.yaml](docs/openapi.yaml)

## 最小调用示例

阻塞调用：

```bash
curl -X POST http://127.0.0.1:8787/v1/chat ^
  -H "content-type: application/json" ^
  -d "{\"content\":\"Reply with exactly: OK\"}"
```

流式调用：

```bash
curl -N -X POST http://127.0.0.1:8787/v1/chat/stream ^
  -H "accept: text/event-stream" ^
  -H "content-type: application/json" ^
  -d "{\"content\":\"Explain what you are doing step by step.\"}"
```

示例客户端：

- Python: [examples/python/client.py](examples/python/client.py)
- Node.js: [examples/node/client.mjs](examples/node/client.mjs)

## 手动启动

如果你不想使用一键启动：

1. 安装依赖：

```bash
npm install
```

2. 把 [.env.example](.env.example) 复制成 `.env`，至少设置这些字段：

- `TRAE_BIN`
- `TRAE_PROJECT_PATH`
- `TRAE_COMPOSER_SELECTORS`
- `TRAE_SEND_BUTTON_SELECTORS`
- `TRAE_RESPONSE_SELECTORS`

3. 启动 Trae：

```bash
npm run start:trae
```

4. 启动网关：

```bash
npm run start:gateway
```

5. 检查状态：

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/ready
```

## 配置说明

完整配置见 [.env.example](.env.example)。

比较重要的配置项：

- `TRAE_BIN`: `Trae.exe` 路径
- `TRAE_PROJECT_PATH`: Trae 启动后要打开的项目目录
- `TRAE_REMOTE_DEBUGGING_PORT`: 主调试端口
- `TRAE_QUICKSTART_USE_ISOLATED_PROFILE`: 是否允许 quickstart 自动切换到独立 Trae 窗口
- `TRAE_QUICKSTART_REMOTE_DEBUGGING_PORT`: 独立 quickstart 窗口使用的调试端口
- `TRAE_QUICKSTART_USER_DATA_DIR`: 独立 quickstart 窗口使用的 profile 目录
- `TRAE_QUICKSTART_OPEN_CHAT`: quickstart 成功后是否自动打开 `/chat`
- `TRAE_COMPOSER_SELECTORS`: 输入框 selector
- `TRAE_SEND_BUTTON_SELECTORS`: 发送按钮 selector
- `TRAE_RESPONSE_SELECTORS`: 最终回复区域 selector
- `TRAE_ACTIVITY_SELECTORS`: 过程文本和活动文本 selector
- `TRAE_NEW_CHAT_SELECTORS`: 新建 Trae 对话使用的 selector
- `TRAE_GATEWAY_TOKEN`: API 的 Bearer token
- `TRAE_ALLOWED_ORIGINS`: 浏览器来源白名单
- `TRAE_ENABLE_DEBUG_ENDPOINTS`: 是否开启 `/debug/automation`

## Selector 诊断

如果 Trae 更新后默认 selector 不再匹配，可以先执行：

```bash
npm run inspect:trae
```

诊断信息会包含：

- 命中的 target 信息
- selector 命中数量
- 可见输入框和发送按钮候选
- 回复区和活动区的诊断结果

## Safe Attach 模式

如果 Trae 已经在运行，而且你不想让脚本重新拉起它：

```bash
set TRAE_SAFE_ATTACH_ONLY=1
npm run start:gateway
```

如果你想让 Trae 离线时本地 API 也保持可用：

```bash
set TRAE_SAFE_ATTACH_ONLY=1
set TRAE_ENABLE_MOCK_BRIDGE=1
npm run start:gateway
```

## 限制

- 这套桥接读取的是页面 DOM 文本，不是 OCR，也不是调用 Trae 私有 API。
- Trae UI 更新后，selector 可能失效。
- 过程文本和最终回复都来自渲染后的 UI，所以任务流里可能包含中间状态文本。
- 会话是网关内存里的逻辑会话，不是 Trae 内部持久 ID。
- 请求会串行执行，避免多个调用方同时操作同一个 Trae 窗口。

## 排障

基础检查：

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/ready
npm run inspect:trae
```

需要更详细诊断时：

```bash
set TRAE_ENABLE_DEBUG_ENDPOINTS=1
curl http://127.0.0.1:8787/debug/automation
```

## 验证

```bash
npm test
npm run lint
npm run typecheck
```
