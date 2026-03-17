# OpenClaw 集成说明

这份说明面向希望让 OpenClaw 通过 TraeAPI 把 Trae 当成 IDE 工具使用的用户。

目标链路：

`OpenClaw agent -> trae_delegate -> TraeAPI -> Trae 桌面端`

这不是模型提供方接入。OpenClaw 继续使用自己的 LLM，Trae 只是一个可调用的 IDE 工具。

## 前置条件

- Windows 或 macOS，且已经安装 Trae。
- 本机有可用的 OpenClaw。
- 本仓库已经在本地。
- Trae 支持 `--remote-debugging-port=<port>`。

## 1. 启动 TraeAPI

推荐路径：

- Windows：双击 `start-traeapi.cmd`
- macOS：双击 `start-traeapi.command`

或者在终端里执行：

```bash
npm run quickstart
```

quickstart 会尽量自动完成这些事：

- 优先附着到已经打开的 Trae 窗口
- 当前窗口不适合自动化时，自动切到独立 Trae 窗口
- 条件允许时，把现有本地 Trae 的关键登录态和存储复制到独立 profile
- 启动本地网关 `http://127.0.0.1:8787`

确认是否 ready：

```bash
curl http://127.0.0.1:8787/ready
```

你希望看到 `success: true`。

## 2. 加载 OpenClaw 插件

如果 OpenClaw 和 TraeAPI 都在本地源码目录里，最简单的配置方式是：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/path/to/TraeAPI/integrations/openclaw-trae-plugin"
      ]
    },
    "entries": {
      "trae-ide": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "autoStart": true,
          "quickstartCommand": "\"/path/to/TraeAPI/start-traeapi.command\"",
          "quickstartCwd": "/path/to/TraeAPI"
        }
      }
    }
  }
}
```

Windows 用户可以继续使用 `"C:\path\to\TraeAPI\start-traeapi.cmd"` 作为 `quickstartCommand`。如果路径里可能有空格，保留外层引号。

如果 TraeAPI 开启了 `TRAE_GATEWAY_TOKEN`，再加上：

```json
{
  "plugins": {
    "entries": {
      "trae-ide": {
        "config": {
          "token": "your-token"
        }
      }
    }
  }
}
```

你也可以直接从仓库示例开始：

- [完整示例](../integrations/openclaw-trae-plugin/examples/openclaw.config.example.json)
- [macOS 示例](../integrations/openclaw-trae-plugin/examples/openclaw.config.macos.example.json)
- [最小示例](../integrations/openclaw-trae-plugin/examples/openclaw.minimal.config.json)

## 3. 正确启用工具

请用 `alsoAllow`，不要只写插件专用的 `allow`。

推荐写法：

```json
{
  "tools": {
    "alsoAllow": ["trae-ide"]
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "alsoAllow": ["trae_status", "trae_new_chat", "trae_delegate"]
        }
      }
    ]
  }
}
```

原因很直接：

- OpenClaw 会清理只包含插件工具的 `tools.allow`
- `tools.alsoAllow` 才是保留核心工具、同时追加插件工具的正确方式

改完配置后，记得重启 OpenClaw Gateway。

## 4. 验证插件是否生效

先确认 OpenClaw 能看到插件：

```bash
openclaw plugins info trae-ide
```

正常结果里应该有：

- 插件状态 `loaded`
- 工具 `trae_status, trae_new_chat, trae_delegate`

然后再让 OpenClaw 进行显式调用：

- `Use trae_status exactly once and tell me whether Trae is ready.`
- `Use trae_delegate exactly once and ask Trae to summarize this project.`

你也可以在 OpenClaw 对话框里直接输入：

- `/Trae 分析当前仓库，并实现缺失的登录错误提示`

插件会自动：

- 启动或唤起 TraeAPI
- 新建一个 Trae 对话
- 把 `/Trae` 后面的任务直接交给 Trae

## 5. 排障

agent 里看不到 `trae_status` 或 `trae_delegate`

- 先跑 `openclaw plugins info trae-ide`
- 把插件相关配置从 `tools.allow` 改成 `tools.alsoAllow`
- 配置改完后重启 OpenClaw Gateway

`/ready` 不是 true

- 说明 TraeAPI 能连到 Trae，但当前页面不处于可自动化状态
- 最省事的恢复方式通常是：
  1. 关闭当前 Trae 窗口
  2. 重新启动 TraeAPI
  3. 让它重新拉起带调试端口的 Trae

Trae 打开了，但还停在不对的页面

- 确认 Trae 已登录
- 确认已经打开项目
- 跑 `npm run inspect:trae` 看 selector 和页面状态
