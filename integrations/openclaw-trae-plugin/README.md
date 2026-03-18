# OpenClaw Trae 插件

[中文](README.md) | [English](README.en.md)

这个插件让 OpenClaw 可以通过 TraeAPI 调用本地 Trae 桌面端，把 Trae 当作一个 IDE 工具使用。

目标链路：

`OpenClaw -> trae_delegate -> TraeAPI -> Trae 桌面端`

这不是模型提供方接入。OpenClaw 继续使用自己的 LLM，这个插件只负责把 IDE 工作委托给 Trae。

## 持续更新版安装

如果你希望后续通过 OpenClaw 直接收插件更新，优先用 npm 安装版：

```bash
openclaw plugins install traeelectronapi
openclaw plugins enable trae-ide
```

后续发布新版本后，用户更新：

```bash
openclaw plugins update trae-ide
```

注意：

- npm 包内已经包含完整 TraeAPI runtime
- 用户执行 `openclaw plugins update trae-ide` 时，插件和网关能力会一起更新
- 如果启用 `autoStart`，插件会优先拉起包内自带的 quickstart 入口，不需要额外本地仓库

## 暴露的工具

- `trae_status`
- `trae_new_chat`
- `trae_delegate`

## 斜杠命令

- `/Trae <任务>`
- `/Trae process <任务>`

在 OpenClaw 对话输入框里直接输入 `/Trae`，插件会：

1. 自动确保 TraeAPI 已启动
2. 新建一个 Trae 对话
3. 把你在 `/Trae` 后面的任务直接交给 Trae 执行
4. 默认只把 Trae 的最终回复回传到 OpenClaw

如果你需要把过程信息也一起回传，再用：

- `/Trae process <任务>`

例如：

```text
/Trae 分析当前仓库，并实现缺失的登录错误提示
```

```text
/Trae process 分析当前仓库，并把执行过程也一起返回
```

## 推荐接入方式

1. 先启动 TraeAPI。
   - Windows：`start-traeapi.cmd`
   - macOS：`start-traeapi.command`
2. 在 OpenClaw 中从本地路径加载本插件。
3. 用 `tools.alsoAllow` 放行插件工具。
4. 重启 OpenClaw Gateway。
5. 让 OpenClaw 调用 `trae_status`、`trae_new_chat` 或 `trae_delegate`。

如果启用了 `autoStart`，插件会优先使用仓库自带的 quickstart 启动入口：

- Windows：`start-traeapi.cmd`
- macOS：`start-traeapi.command`

相关文档：

- [OpenClaw 用户安装指南](../../docs/install.zh-CN.md)
- [OpenClaw 集成说明](../../docs/openclaw-integration.zh-CN.md)
- [常见问题](../../docs/faq.zh-CN.md)

## 示例配置

- [完整示例](examples/openclaw.config.example.json)
- [macOS 示例](examples/openclaw.config.macos.example.json)
- [最小示例](examples/openclaw.minimal.config.json)

## 关键注意点

请使用：

- `tools.alsoAllow`
- `agents.list[].tools.alsoAllow`

不要只写插件专用的 `tools.allow`。否则 OpenClaw 可能能看到插件，但 agent 实际仍然调不到 `trae_delegate`。

## 快速验证

重启 OpenClaw 后：

1. 确认插件已经加载
2. 让 OpenClaw 执行：`Use trae_status exactly once and tell me whether Trae is ready.`
3. 再让 OpenClaw 执行：`Use trae_delegate exactly once and ask Trae to summarize this project.`
