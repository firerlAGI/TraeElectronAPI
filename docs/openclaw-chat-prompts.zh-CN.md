# OpenClaw 对话安装模板

这份文档面向中文用户，目标是让用户直接用自然语言对 OpenClaw 说话，由 OpenClaw 完成 TraeAPI + Trae 插件安装。

## 推荐说法

最推荐用户直接说：

```text
请帮我从 GitHub 安装 TraeAPI，让你可以通过 Trae 这个 IDE 工具来执行任务。
仓库地址是：https://github.com/firerlAGI/TraeElectronAPI
请优先按仓库里的 AGENTS.md 和 AI_INSTALL.zh-CN.md 执行。
如果仓库还不在本地，请先下载到本地，再运行安装脚本。
安装完成后请验证 trae-ide、trae_status、trae_delegate 是否可用，并告诉我下一步。
```

## 更短的说法

如果用户想少说一点，可以直接用：

```text
帮我安装 TraeAPI 的 OpenClaw 集成，仓库在 GitHub：firerlAGI/TraeElectronAPI。
请按仓库里的 AI 安装说明执行，并在结束后验证 trae_status。
```

## 明确要求自动执行的说法

如果用户希望 OpenClaw 少解释、多执行，可以这样说：

```text
我授权你直接执行安装步骤。
请从 GitHub 下载 TraeElectronAPI，到本地完成 OpenClaw 插件安装和配置。
优先使用仓库里的 bootstrap-openclaw-integration.ps1 或 install-openclaw-integration.ps1。
安装后请运行验证命令，不要只停留在阅读文档。
```

## 用户希望逐步确认的说法

如果用户不希望 OpenClaw 直接动配置，可以这样说：

```text
请先检查 TraeAPI 仓库里的安装步骤，并告诉我你准备执行哪些命令。
我确认后，你再开始安装 OpenClaw 的 trae-ide 插件。
```

## OpenClaw 理想执行顺序

当 OpenClaw 收到上面的安装请求后，理想行为应该是：

1. 读取仓库里的 [AGENTS.md](../AGENTS.md)
2. 读取 [AI 安装说明](../AI_INSTALL.zh-CN.md)
3. 如果仓库不在本地：
   - 下载 GitHub 仓库 zip
   - 或先下载 `bootstrap-openclaw-integration.ps1`
4. 优先执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\bootstrap-openclaw-integration.ps1
```

5. 如果仓库已经在本地，则执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

6. 安装完成后验证：

```powershell
openclaw plugins info trae-ide
openclaw config validate
```

7. 提醒用户重启 OpenClaw Gateway
8. 再调用一次：
   - `Use trae_status exactly once and tell me whether Trae is ready.`

## 用户可直接复制的完整提示词

```text
请帮我安装 TraeAPI 的 OpenClaw 集成。
仓库地址是：https://github.com/firerlAGI/TraeElectronAPI

请按下面规则执行：
1. 优先阅读仓库里的 AGENTS.md 和 AI_INSTALL.zh-CN.md
2. 如果仓库不在本地，先从 GitHub 下载到本地
3. 优先执行 bootstrap-openclaw-integration.ps1
4. 如果 bootstrap 不适用，再执行 install-openclaw-integration.ps1
5. 安装完成后必须验证：
   - openclaw plugins info trae-ide
   - openclaw config validate
6. 最后告诉我：
   - 是否安装成功
   - 是否需要我重启 OpenClaw Gateway
   - 我接下来应该说什么来测试 trae_status 和 trae_delegate
```

## 安装完成后用户可以怎么测

安装完成后，用户可以继续对 OpenClaw 说：

```text
Use trae_status exactly once and tell me whether Trae is ready.
```

如果状态正常，再说：

```text
Use trae_delegate exactly once and ask Trae to summarize this project.
```

## 注意

- 不建议让用户自己手改大段 JSON。
- 不建议让 OpenClaw 直接执行 `openclaw plugins install <github-url>`，因为这条路不支持。
- 最好的用户体验是：对话里给仓库地址，OpenClaw 自己下载、自行安装、自行验证。
