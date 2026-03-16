# OpenClaw 联调指南

这份说明面向希望让 OpenClaw 通过 TraeAPI 把 Trae 当成 IDE 工具使用的用户。

目标链路：

`OpenClaw agent -> trae_delegate -> TraeAPI -> Trae 桌面端`

这不是模型提供方接入。OpenClaw 继续使用自己的 LLM，Trae 只是一个可调用的 IDE 工具。

## 前置条件

- Windows 机器，且已经安装 Trae。
- 本机有可用的 OpenClaw。
- 本仓库已经拉到本地。
- Trae 支持 `--remote-debugging-port=<port>`。

## 1. 启动 TraeAPI

推荐路径：

1. 直接双击 `start-traeapi.cmd`

或者在终端里执行：

```bash
npm run quickstart
```

quickstart 会尽量自动完成这些事：

- 优先附着到你已经打开的 Trae 窗口
- 当前窗口不适合自动化时，自动切到一个独立 Trae 窗口
- 条件允许时，把现有本地 Trae 的登录态和关键存储复制到独立 profile
- 启动本地网关 `http://127.0.0.1:8787`

确认是否 ready：

```bash
curl http://127.0.0.1:8787/ready
```

你需要看到 `success: true`。

## 2. 加载 OpenClaw 插件

如果 OpenClaw 和 TraeAPI 都在本地源码目录里，最简单的方式是直接从仓库路径加载：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "C:\\path\\to\\TraeAPI\\integrations\\openclaw-trae-plugin"
      ]
    },
    "entries": {
      "trae-ide": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:8787",
          "autoStart": true,
          "quickstartCommand": "C:\\path\\to\\TraeAPI\\start-traeapi.cmd",
          "quickstartCwd": "C:\\path\\to\\TraeAPI"
        }
      }
    }
  }
}
```

如果你的 TraeAPI 开了 Bearer token，再加上：

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
          "alsoAllow": ["trae_status", "trae_delegate"]
        }
      }
    ]
  }
}
```

原因很直接：

- OpenClaw 会剥掉只包含插件工具的 `tools.allow`
- `tools.alsoAllow` 才是增量启用插件工具、同时保留核心工具的正确方式

配置改完以后，记得重启 OpenClaw Gateway。

## 4. 验证插件是否生效

先确认 OpenClaw 能看到插件：

```bash
openclaw plugins info trae-ide
```

正常结果里应该有：

- 插件状态 `loaded`
- 工具 `trae_status, trae_delegate`

然后再让 OpenClaw 进行显式调用：

- `Use trae_status exactly once and tell me whether Trae is ready.`
- `Use trae_delegate exactly once and ask Trae to summarize this project.`

## 5. 真实联调已经验证过什么

这套仓库已经和真实本地 OpenClaw、真实 Trae 桌面端做过联调，确认过：

- 改成 `alsoAllow` 后，`trae_status` 能进入 agent 视角
- `trae_delegate` 能完成 `OpenClaw -> TraeAPI -> Trae` 的真实调用闭环
- TraeAPI 原生 `POST /v1/chat` 也能成功返回真实结果

还有一个真实细节要知道：Trae 可能会在回复前加自己的风格前缀，例如 `SOLO Coder`，所以“要求逐字精确返回”的提示词也可能带这个前缀。

## 排障

agent 里看不到 `trae_status` 或 `trae_delegate`

- 先跑 `openclaw plugins info trae-ide` 确认插件确实加载了
- 把插件相关配置从 `tools.allow` 改成 `tools.alsoAllow`
- 配置改完后重启 OpenClaw Gateway

`/ready` 不是 true

- 说明 TraeAPI 能连到 Trae，但当前 Trae 页面不处于可自动化状态
- 最省事的恢复方式通常是：
  1. 关闭当前 Trae 窗口
  2. 重新启动 TraeAPI
  3. 让它重新拉起带调试端口的 Trae

Trae 打开了，但还是落在不对的界面

- 确认 Trae 已登录
- 确认已经打开了项目
- 跑 `npm run inspect:trae` 看 selector 和页面状态

切到独立窗口后又要求重新登录

- 保持 `TRAE_QUICKSTART_PROFILE_SEED=1`
- 如果主 Trae 进程仍然锁着关键 cookie 文件，独立 profile 可能还是拿不到完整登录态
- 这种情况下，更稳的做法是直接让 TraeAPI 重启主 Trae，并由主 profile 直接暴露调试端口
