# AI 安装说明

这份文档是给 OpenClaw 或其他 AI 助手看的，目标是让 AI 从 GitHub 开始，把 TraeAPI + OpenClaw 插件安装到用户本机。

## 目标

把下面这条链路安装到用户机器上：

`OpenClaw -> trae_delegate -> TraeAPI -> Trae 桌面端`

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

## 首选下载地址

- 仓库 zip：
  - `https://github.com/firerlAGI/TraeElectronAPI/archive/refs/heads/main.zip`
- bootstrap 脚本：
  - `https://raw.githubusercontent.com/firerlAGI/TraeElectronAPI/main/scripts/bootstrap-openclaw-integration.ps1`

## AI 推荐执行步骤

1. 下载 bootstrap 脚本到临时目录。
2. 执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bootstrap-openclaw-integration.ps1
```

3. 安装完成后检查：

```powershell
openclaw plugins info trae-ide
openclaw config validate
```

4. 告诉用户重启 OpenClaw Gateway。
5. 再让用户或 AI 执行一次：
   - `Use trae_status exactly once and tell me whether Trae is ready.`

## 如果仓库已经在本地

直接执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-openclaw-integration.ps1
```

## 不要这样做

- 不要执行 `openclaw plugins install <github-url>`
- 不要让用户手工编辑一大段 JSON，除非 CLI 写配置失败
- 不要只安装 `integrations/openclaw-trae-plugin`，因为用户还需要 TraeAPI 本体和 `start-traeapi.cmd`

## 成功标准

不是“下载完成”，而是下面这些条件成立：

- `openclaw plugins info trae-ide` 成功
- `openclaw config validate` 成功
- OpenClaw 可以调用 `trae_status`
- TraeAPI 可以通过 `start-traeapi.cmd` 启动
