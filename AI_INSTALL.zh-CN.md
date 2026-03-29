# AI 安装说明

这份文档是给 OpenClaw 或其他 AI 助手看的，目标是让 AI 从 GitHub 开始，把 TraeClaw + OpenClaw 插件安装到用户本机。

## OpenClaw 最短执行版

如果你是 OpenClaw，请优先按这个最短路径执行：

1. 先判断仓库是否已经在本地。
2. 再判断用户平台：
   - Windows：优先使用 `.ps1`
   - macOS：优先使用 `.sh`
3. 如果仓库已经在本地：
   - 在仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

```bash
bash ./scripts/install-openclaw-integration.sh
```

4. 如果仓库还不在本地：
   - 优先执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bootstrap-openclaw-integration.ps1
```

```bash
bash ./scripts/bootstrap-openclaw-integration.sh
```

5. 安装完成后必须验证：

```powershell
openclaw plugins info traeclaw
openclaw config validate
```

6. 然后提醒用户：
   - 重启 OpenClaw Gateway
   - 再测试 `trae_status`

如果你只能记住一件事，请记住：

- 本地仓库：执行 `scripts/install-openclaw-integration.ps1`
- 远程仓库：优先执行 `scripts/bootstrap-openclaw-integration.ps1`
- macOS 本地仓库：执行 `scripts/install-openclaw-integration.sh`
- macOS 远程仓库：优先执行 `scripts/bootstrap-openclaw-integration.sh`

## 用户可直接复制给 OpenClaw 的本地安装提示词

如果用户已经有本地仓库，优先让用户直接把下面这段话发给 OpenClaw：

```text
请帮我把本地 TraeClaw 仓库安装到 OpenClaw。
仓库路径是：E:\path\to\TraeClaw

请先阅读仓库里的 AGENTS.md 和 AI_INSTALL.zh-CN.md。
因为仓库已经在本地，请直接在仓库根目录执行：
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1

如果你在 macOS 上，请改为：
bash ./scripts/install-openclaw-integration.sh

不要使用 openclaw plugins install <github-url> 或 git spec。
安装完成后请验证：
- openclaw plugins info traeclaw
- openclaw config validate

最后请告诉我：
1. 是否安装成功
2. 是否需要我重启 OpenClaw Gateway
3. 我下一句应该如何测试 trae_status 和 trae_delegate
```

## 目标

把下面这条链路安装到用户机器上：

`OpenClaw -> trae_delegate -> TraeClaw -> Trae 桌面端`

## 重要约束

- OpenClaw 不能直接从 GitHub URL 或 git spec 安装插件。
- OpenClaw 只支持安装：
  - 本地目录
  - 本地 `.zip`
  - 本地 `.tgz`
  - npm registry spec
- 所以如果用户只有 GitHub 仓库，AI 必须先下载内容到本地，再执行安装。

## 首选安装路径

如果用户本机是 Windows，优先执行：

1. 下载并执行：
   - `scripts/bootstrap-openclaw-integration.ps1`
2. 这个脚本会：
   - 从 GitHub 下载仓库 zip
   - 解压到本地固定目录
   - 调用本地安装脚本
   - 安装 OpenClaw 插件
   - 写入最小配置
   - 做安装后验证

如果用户本机是 macOS，优先执行：

1. 直接执行：
   - `scripts/bootstrap-openclaw-integration.sh`
2. 这个脚本会：
   - 从 GitHub 下载仓库 zip
   - 解压到本地固定目录
   - 调用本地 shell 安装脚本
   - 安装 OpenClaw 插件
   - 写入最小配置
   - 做安装后验证

## 首选下载地址

- 仓库 zip：
  - `https://github.com/firerlAGI/TraeClaw/archive/refs/heads/main.zip`
- bootstrap 脚本：
  - `https://raw.githubusercontent.com/firerlAGI/TraeClaw/main/scripts/bootstrap-openclaw-integration.ps1`

## AI 推荐执行步骤

1. 下载 bootstrap 脚本到临时目录。
2. 执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bootstrap-openclaw-integration.ps1
```

3. 安装完成后检查：

```powershell
openclaw plugins info traeclaw
openclaw config validate
```

4. 告诉用户重启 OpenClaw Gateway。
5. 再让用户或 AI 执行一次：
   - `Use trae_status exactly once and tell me whether Trae is ready.`

如果需要给中文用户一个可以直接复制到对话里的提示词，见：

- [OpenClaw 对话安装模板](docs/openclaw-chat-prompts.zh-CN.md)

## 如果仓库已经在本地

直接执行，不要绕到 GitHub 安装路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

macOS 上直接执行：

```bash
bash ./scripts/install-openclaw-integration.sh
```

如果用户明确给出了本地仓库路径，优先在那个路径下执行，不要要求用户手工搬运插件目录。

## 不要这样做

- 不要执行 `openclaw plugins install <github-url>`
- 不要让用户手工编辑一大段 JSON，除非 CLI 写配置失败
- 不要只安装 `integrations/openclaw-trae-plugin`，因为用户还需要 TraeClaw 本体和 `start-traeapi.cmd`
- 不要把“已经下载仓库”误当成“已经安装完成”

## 成功标准

不是“下载完成”，而是下面这些条件成立：

- `openclaw plugins info traeclaw` 成功
- `openclaw config validate` 成功
- OpenClaw 可以调用 `trae_status`
- TraeClaw 可以通过 `start-traeapi.cmd` 启动

## OpenClaw 应向用户报告什么

安装结束时，优先用下面这种格式向用户报告：

1. 当前使用的是哪条安装路径：
   - 本地仓库安装
   - 或 GitHub bootstrap 安装
2. 两条验证命令是否成功：
   - `openclaw plugins info traeclaw`
   - `openclaw config validate`
3. 是否需要用户重启 OpenClaw Gateway
4. 给用户一条可直接复制的测试语句：
   - `Use trae_status exactly once and tell me whether Trae is ready.`
