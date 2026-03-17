# OpenClaw 对话安装模板

这份文档面向中文用户，目标是让用户直接用自然语言对 OpenClaw 说话，由 OpenClaw 完成 TraeAPI + Trae 插件安装。

## 本地仓库一键安装说法

如果仓库已经在本地，最推荐用户直接这样说：

```text
请帮我把本地 TraeAPI 仓库安装到 OpenClaw。
仓库路径是：E:\path\to\TraeElectronAPI

请先阅读仓库里的 AGENTS.md 和 AI_INSTALL.zh-CN.md。
如果我是 Windows 用户，请直接在仓库根目录执行：
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1

如果我是 macOS 用户，请直接在仓库根目录执行：
bash ./scripts/install-openclaw-integration.sh

不要使用 openclaw plugins install <github-url> 或 git spec。
安装完成后请验证：
- openclaw plugins info trae-ide
- openclaw config validate

最后请告诉我：
1. 是否安装成功
2. 是否需要我重启 OpenClaw Gateway
3. 我下一句应该如何测试 trae_status 和 trae_delegate
```

## 从 GitHub 一键安装说法

如果仓库还不在本地，最推荐用户直接这样说：

```text
请帮我从 GitHub 安装 TraeAPI，让你可以通过 Trae 这个 IDE 工具来执行任务。
仓库地址是：https://github.com/firerlAGI/TraeElectronAPI
请优先按仓库里的 AGENTS.md 和 AI_INSTALL.zh-CN.md 执行。

如果我是 Windows 用户，请优先执行 bootstrap-openclaw-integration.ps1。
如果我是 macOS 用户，请优先执行 bootstrap-openclaw-integration.sh。

安装完成后请验证 trae-ide、trae_status、trae_delegate 是否可用，并告诉我下一步。
```

## 更短的说法

如果用户想少说一点，可以直接用：

```text
帮我安装 TraeAPI 的 OpenClaw 集成。
如果仓库在本地，请直接运行对应平台的 install-openclaw-integration 脚本。
如果仓库不在本地，请优先运行对应平台的 bootstrap-openclaw-integration 脚本。
安装后请验证 trae_status。
```

## OpenClaw 理想执行顺序

当 OpenClaw 收到上面的安装请求后，理想行为应该是：

1. 读取仓库里的 [AGENTS.md](../AGENTS.md)
2. 读取 [AI 安装说明](../AI_INSTALL.zh-CN.md)
3. 先判断仓库是否已经在本地
4. 再判断用户平台：Windows 或 macOS
5. 如果仓库不在本地：
   - Windows：执行 `scripts/bootstrap-openclaw-integration.ps1`
   - macOS：执行 `scripts/bootstrap-openclaw-integration.sh`
6. 如果仓库已经在本地：
   - Windows：执行 `scripts/install-openclaw-integration.ps1`
   - macOS：执行 `scripts/install-openclaw-integration.sh`
7. 安装完成后验证：

```powershell
openclaw plugins info trae-ide
openclaw config validate
```

8. 提醒用户重启 OpenClaw Gateway
9. 再调用一次：
   - `Use trae_status exactly once and tell me whether Trae is ready.`

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
- 最好的用户体验是：对话里给仓库路径或 GitHub 地址，OpenClaw 自己下载、自行安装、自行验证。