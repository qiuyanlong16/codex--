<div align="center">

# codex--

**基于 [nanobot](https://github.com/nanobot-ai/nanobot) 的桌面 AI Agent**

开箱即用的 **Windows** 与 **macOS** 安装包，用户无需自行安装 Python。

[English](./README.md) | **中文**

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](./package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D22.16.0-green)](./package.json)

[下载安装](#下载与安装) · [参与贡献](./CONTRIBUTING_CN.md) · [报告问题](https://github.com/qiuyanlong16/codex--/issues)

</div>

---

## 项目简介

codex-- 将 nanobot AI Agent 封装为 Electron 桌面应用，内置独立 Python 运行时、React WebUI 和一键安装包。开发者可 Fork 仓库、定制 WebUI 或 Agent 工作区并提交 PR — 详见 [CONTRIBUTING_CN.md](./CONTRIBUTING_CN.md)。

```
Electron (codex--)
├── 主进程 (packages/shell)
│   ├── 启动 nanobot gateway (Python, WS :8765 / 健康检查 :18790)
│   ├── 管理进程生命周期
│   └── 与渲染进程 IPC 通信
└── 渲染进程 (packages/web)
    └── React WebUI
        ├── HTTP  → http://127.0.0.1:18790/api/...
        └── WS    → ws://127.0.0.1:8765/ws
```

| 组件       | 说明                                    |
| ---------- | --------------------------------------- |
| **Shell**  | Electron 42 主进程 — 启动、健康检查、退出 |
| **WebUI**  | React + Vite，支持主题与国际化          |
| **后端**   | nanobot gateway 模式，内置 Python venv  |
| **安装包** | Windows NSIS `.exe` / macOS 未签名 `.dmg` |

---

## 下载与安装

### 发布产物（v1.0.0）

| 平台              | 架构                              | 文件名                           | 状态       |
| ----------------- | --------------------------------- | -------------------------------- | ---------- |
| **Windows**       | x64                               | `codex---Setup-1.0.0-x64.exe`    | ✅ 已提供  |
| **macOS**         | arm64（Apple Silicon M1/M2/M3/M4） | `codex---1.0.0-arm64.dmg`        | ✅ 已提供  |
| macOS Intel       | x64                               | —                                | ❌ 暂未构建 |

**下载方式**

1. **GitHub Releases**（打 tag `v1.0.0` 后推荐）— [Releases 页面](https://github.com/qiuyanlong16/codex--/releases)
2. **GitHub Actions 产物** — 打开最新一次绿色 [Build 工作流](https://github.com/qiuyanlong16/codex--/actions/workflows/build.yml) → 下载 `codex---windows-x64` 或 `codex---macos-arm64`

> **说明：** 当前 macOS 仅提供 **Apple Silicon (arm64)** 包。Intel Mac 需自行从源码构建，或等待后续 x64 版本。

---

### Windows

1. 下载 `codex---Setup-1.0.0-x64.exe`
2. 运行 NSIS 安装向导
3. 从开始菜单或桌面快捷方式启动 **codex--**
4. 默认安装路径：`C:\Program Files (x86)\Codex--\codex--`

**日志：** `%LOCALAPPDATA%\ByNanobot\main.log`

---

### macOS（Apple Silicon）

macOS `.dmg` **未签名**，Gatekeeper 可能拦截首次启动。请按以下步骤操作：

#### 1. 安装

1. 下载 `codex---1.0.0-arm64.dmg`
2. 打开 DMG，将 **codex--** 拖入 **应用程序（Applications）**

#### 2. 移除隔离属性（必做）

```bash
sudo xattr -dr com.apple.quarantine /Applications/codex--.app
```

清除「从互联网下载」标记，避免系统持续拦截。

#### 3. 隐私与安全性（若仍被拦截）

1. 打开 **系统设置 → 隐私与安全性**
2. 在 **安全性** 区域找到 *「codex-- 已被拦截」* → 点击 **仍要打开**
3. 或：**访达 → 应用程序 → 右键 codex-- → 打开**（仅首次需要）

#### 4. 可选权限

根据 Agent 使用情况，系统可能请求：

- **文件与文件夹** — 访问 `~/.nanobot/` 工作区
- **本地网络** — gateway 监听 `127.0.0.1`

可在 **系统设置 → 隐私与安全性** 中按需授权。

#### 5. 首次启动

- 首次启动约需 10–15 秒（解压内置 Python venv）
- 运行时数据：`~/.by-claw-nanobot/`
- 配置文件：`~/.nanobot/config.json`
- 日志：`~/Library/Application Support/ByNanobot/main.log`

#### 干净重装（排障）

```bash
# 先退出应用，再执行：
rm -rf ~/.by-claw-nanobot
rm -rf ~/Library/Application\ Support/ByNanobot
# 从最新 .dmg 重装 — 使用旧 .dmg 时不要单独删 venv
```

---

## 首次使用 — 配置 Agent

1. 打开 **设置**，配置模型提供商（含 **OpenAI Codex**，`openai_codex`）
2. 编辑 `~/.nanobot/workspace/` 下的 Agent 文件：
   - `AGENTS.md` — 行为说明
   - `SOUL.md` — 性格 / 语气
   - `USER.md` — 用户资料（首次运行自动填充）
3. 网关配置：`~/.nanobot/config.json`
4. 可选 CLI：
   - Windows：`~/.by-claw-nanobot/nanobot.cmd`
   - macOS：`~/.by-claw-nanobot/bin/nanobot`

技能、MCP 工具、子 Agent 可在 WebUI 设置中管理。

---

## 参与贡献

欢迎 Pull Request。提交前请阅读 **[CONTRIBUTING_CN.md](./CONTRIBUTING_CN.md)**。

**快速开发环境：**

```bash
git clone https://github.com/qiuyanlong16/codex--.git
cd codex--
pnpm install
pnpm pack:clone-nanobot
pnpm pack:sync-webui
pnpm pack:create-venv   # 需要 Python >= 3.12
pnpm dev                # Vite + Electron 热重载
```

**测试：**

```bash
pnpm build:shared
pnpm --filter @byclaw-nanobot/web test
```

**PR 要点：** 改动聚焦 · CI 通过 · 跨平台互不影响 · 用户可见变更同步文档/i18n。

---

## 项目结构

```
codex--/
├── packages/
│   ├── shared/          # @byclaw-nanobot/shared — IPC 类型
│   ├── shell/           # @byclaw-nanobot/shell  — Electron 主进程
│   └── web/             # @byclaw-nanobot/web    — React WebUI
├── vendor/nanobot/      # 构建时克隆（已 gitignore）
├── scripts/
│   ├── build/           # 打包流水线
│   ├── dev/             # 开发启动
│   └── diag/            # 诊断 / 修复脚本
├── resources/           # 图标、安装资源、配置模板
└── electron-builder.yml
```

---

## 从源码构建

```bash
# 前提：Node >= 22.16.0，pnpm >= 9.0.0，Python >= 3.12

pnpm pack:clone-nanobot
pnpm pack:sync-webui
pnpm install
pnpm pack:create-venv
pnpm build:web
pnpm dev              # 开发模式
pnpm bundle           # 完整安装包
```

**输出：**

- Windows：`dist-release/codex---Setup-1.0.0-x64.exe`
- macOS：`dist-release/codex---1.0.0-arm64.dmg`

---

## ⚠️ 跨平台打包（重要）

**Windows 安装包只能在 Windows 上构建；macOS 只能在 macOS 上构建。** 两个平台的 Python 运行时**不可混用**。

| 平台    | 构建环境                        | 产物          | Python 策略                                      |
| ------- | ------------------------------- | ------------- | ------------------------------------------------ |
| Windows | `windows-latest` 或本机 Windows | `.exe` (NSIS) | 嵌入 `python.exe` + DLL，`python313._pth`        |
| macOS   | `macos-latest` 或本机 Mac       | `.dmg`        | 嵌入 `Python.app` + dylib，`install_name_tool`   |

**禁止：**

- ❌ 在 Windows 上打 `.dmg`，或在 Mac 上打 `.exe`
- ❌ 把 Windows 的 `python-venv_*.tar` 复制到 Mac 包（或反向）
- ❌ 使用**旧版** `.dmg` 时删除 `~/.by-claw-nanobot/resources/python-venv`

**CI：** 推送到 `main` / `master` 触发 `.github/workflows/build.yml`；推送 tag（`v*`）触发 `.github/workflows/release.yml` 并发布 GitHub Release。

**平台环境变量：**

| 变量                     | 值                                                         |
| ------------------------ | ---------------------------------------------------------- |
| `BYCLAW_TARGET_PLATFORM` | `win32`（Windows 默认）/ `darwin`（macOS 默认）            |
| `BYCLAW_TARGET_ARCH`     | `x64` / `arm64`                                            |

---

## 构建流水线

由 `scripts/build/build-all.mjs` 编排：

| # | 步骤           | 脚本                     | 输出                                    |
| - | -------------- | ------------------------ | --------------------------------------- |
| 1 | 克隆 nanobot   | `clone-nanobot.mjs`      | `vendor/nanobot/`                       |
| 2 | 同步 WebUI     | `sync-webui.mjs`         | `packages/web/`                         |
| 3 | 构建 WebUI     | `pnpm build:web`         | `packages/web/dist/`                    |
| 4 | 构建 shell     | `pnpm build:shell`       | `packages/shell/dist/`                  |
| 5 | 创建 venv      | `create-python-venv.mjs` | `packages/shell/resources/python-venv/` |
| 6 | 打包 venv      | `pack-python-venv.mjs`   | `python-venv_*.tar`                     |
| 7 | electron-builder | `bundle-cached.mjs`    | `dist-release/*.exe` 或 `*.dmg`         |

**跳过步骤：** `BYCLAW_PACK_SKIP_CLONE=1`、`BYCLAW_PACK_SKIP_VENV=1`、`BYCLAW_PACK_SKIP_BUNDLE=1`。

---

## 故障排除

### macOS：`Library not loaded: ... Python.framework ...`

旧版安装包的 venv 未嵌入完整 Python 运行时。

**解决：** 安装 CI/Releases 上的**新版** `.dmg`（含 `python-darwin-runtime`）。或运行：

```bash
node scripts/diag/nanobot-fix-venv-mac.mjs
```

### macOS：无法打开 / 提示「已损坏」

再次执行隔离清除：

```bash
sudo xattr -dr com.apple.quarantine /Applications/codex--.app
```

然后在 **系统设置 → 隐私与安全性 → 仍要打开**。

### 诊断脚本

| 脚本                            | 平台    |
| ------------------------------- | ------- |
| `nanobot-startup-diagnostic.ps1`| Windows |
| `nanobot-fix-venv.ps1`          | Windows |
| `nanobot-fix-venv-mac.mjs`      | macOS   |

---

## 命名约定

| 项目                 | 值                                         |
| -------------------- | ------------------------------------------ |
| 产品名               | `codex--`                                  |
| appId                | `com.codex--.app`                          |
| npm scope            | `@byclaw-nanobot/*`                        |
| 用户数据（Windows）  | `%LOCALAPPDATA%/ByNanobot`                 |
| 用户数据（macOS）    | `~/Library/Application Support/ByNanobot`  |
| 运行时目录（通用）   | `~/.by-claw-nanobot`                       |

---

## 仓库

| 远程   | 地址                                                             |
| ------ | ---------------------------------------------------------------- |
| GitHub | https://github.com/qiuyanlong16/codex--.git                      |
| GitLab | http://gitlab.lenovohuishang.com/baiying-ai/by-claw-nanobot2.git |

---

## 更新日志

### v1.0.0

- 首个公开发布版本
- Windows x64 NSIS 安装包
- macOS Apple Silicon (arm64) 未签名 DMG，内置可移植 Python 运行时
- 跨平台 Electron Shell，macOS 使用系统标题栏布局
- GitHub Actions 并行构建 Windows + macOS
