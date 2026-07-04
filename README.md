# by-claw-nanobot

An Electron desktop product based on nanobot, packaging the nanobot AI Agent into a ready-to-use Windows installer.

---

## Architecture

```
Electron (by-claw-nanobot)
├── Main Process (packages/shell)
│   ├── Starts nanobot gateway (Python, WebSocket port 8765 / health check port 18790)
│   ├── Manages nanobot process lifecycle
│   └── Communicates with renderer process via IPC
└── Renderer Process (packages/web)
    └── React WebUI (synced from nanobot repository)
        ├── HTTP API  → http://127.0.0.1:18790/api/...
        └── WebSocket → ws://127.0.0.1:8765/ws
```

- **Shell**: Electron 42 main process — manages nanobot process startup, health checks, and shutdown
- **WebUI**: React application synced from nanobot source, built with Vite, supports theme switching and i18n
- **Python Backend**: nanobot runs in gateway mode, with CORS configured to allow Electron origins
- **Installer**: NSIS installer with a bundled Python venv (no Python installation required for end users)

## Directory Structure

```
by-claw-nanobot/
├── packages/
│   ├── shared/          # @byclaw-nanobot/shared — IPC channel / type definitions
│   ├── shell/           # @byclaw-nanobot/shell  — Electron main process
│   └── web/             # @byclaw-nanobot/web    — React WebUI (synced from nanobot)
├── vendor/
│   └── nanobot/         # nanobot source (git clone, gitignored)
├── scripts/
│   ├── build/           # Build pipeline scripts
│   ├── dev/             # Dev mode launch scripts
│   ├── diag/            # Diagnostic / fix scripts
│   └── policy/          # Log policy
├── resources/
│   ├── icons/           # App icons (tray, installer)
│   ├── installer/       # NSIS installer resources (sidebar image, banner)
│   └── nanobot-config-template/  # nanobot default config template
└── electron-builder.yml # Installer packaging config
```

## Quick Start

```bash
# Prerequisites: Node >= 22.16.0, pnpm >= 9.0.0, Python >= 3.12 (for creating venv)
# Note: The current packaging pipeline only supports Windows

# 1. Clone nanobot source to vendor/nanobot/
pnpm pack:clone-nanobot

# 2. Sync React WebUI to packages/web/
pnpm pack:sync-webui

# 3. Install JS dependencies
pnpm install

# 4. Create Python venv (installs nanobot + all Python dependencies)
pnpm pack:create-venv

# 5. Build WebUI
pnpm build:web

# 6. Dev mode (Vite dev server + Electron hot reload)
pnpm dev

# 7. Build full installer (one-command — runs all steps above)
pnpm bundle
# Output: dist-release/by-claw-nanobot-Setup-0.1.0-x64.exe
```

## Build Pipeline

The full build is orchestrated by `scripts/build/build-all.mjs`, in the following order:

| # | Step | Script | Output |
|---|------|--------|--------|
| 1 | Clone nanobot | `clone-nanobot.mjs` | `vendor/nanobot/` |
| 2 | Sync WebUI source | `sync-webui.mjs` | `packages/web/` |
| 3 | Build WebUI | `pnpm build:web` | `packages/web/dist/` |
| 4 | Build Electron shell | `pnpm build:shell` | `packages/shell/dist/` |
| 5 | Create Python venv | `create-python-venv.mjs` | `packages/shell/resources/python-venv/` |
| 6 | Pack venv (split tar) | `pack-python-venv.mjs` | `python-venv_*.tar` |
| 7 | NSIS installer | `bundle-cached.mjs` | `dist-release/*.exe` |

**Skip specific steps** (environment variables):

| Variable | Description |
|----------|-------------|
| `BYCLAW_PACK_SKIP_CLONE=1` | Skip cloning (use existing `vendor/`) |
| `BYCLAW_PACK_SKIP_VENV=1` | Skip venv creation and packing |
| `BYCLAW_PACK_SKIP_BUNDLE=1` | Skip electron-builder |
| `BYCLAW_NANOBOT_REPO=<url>` | Override nanobot repo URL (defaults to GitHub) |
| `BYCLAW_NANOBOT_BRANCH=<name>` | Specify branch to clone (defaults to `main`) |
| `BYCLAW_PYTHON_VENV_DIR=<path>` | Use a venv at the specified path |

## Upgrade Strategy

- **WebUI**: `git pull vendor/nanobot` → `sync-webui` → merge customizations → `build:web`
- **Python Backend**: `git pull vendor/nanobot` → `create-python-venv`

## Diagnostic Tools

`scripts/diag/` provides Windows environment diagnostic and repair scripts:

- `nanobot-startup-diagnostic.ps1` — Collects startup diagnostics
- `nanobot-fix-venv.ps1` — Fixes Python venv issues

## Naming Conventions

| Dimension | Value |
|-----------|-------|
| Global name | `by-claw-nanobot` |
| appId | `com.byclaw.nanobot` |
| npm scope | `@byclaw-nanobot/*` |
| User data | `%LOCALAPPDATA%/ByNanobot` |
| Home directory | `~/.by-claw-nanobot` |
| Install path | `C:\Program Files (x86)\ByNanobot\by-claw-nanobot` |

## Startup Flow & Performance

### Startup Timeline (Typical Values)

| Phase | Duration | Notes |
|-------|----------|-------|
| Electron launch + window creation | ~50ms | Shows "Starting nanobot..." loading screen |
| Python venv loading | ~2.7s | Loads python.exe + nanobot modules |
| Git store initialization | ~0.9s | Workspace git repo |
| Tool registration | **~7.7s** | Scans CLI apps, loads 19 tool definitions (**bottleneck**) |
| WebSocket + health endpoint | ~0.6s | Starts server |
| healthz / readyz pass | ~0.3s | Confirms gateway is healthy |
| Load WebUI | ~0.5s | Loads from gateway port 8766 |
| **Total** | **~12s** | |

### Bottleneck Analysis

The main bottleneck is **tool registration in the nanobot Python side** (~7.7s), which involves nanobot scanning CLI apps and loading tool definitions internally. This is outside Electron's control.

### Optimization Directions (TODO)

1. **Load WebUI from Electron locally** (instead of waiting for gateway)
   - Current: WebUI loads from gateway port 8766, requiring full gateway startup
   - Optimization: Load HTML/JS/CSS from Electron's local `packages/web/dist`, connect WebSocket to gateway asynchronously
   - Effect: Window immediately shows WebUI (with loading state), perceived startup < 1s

2. **Show progress indicator**
   - Current: Static "Starting nanobot..." text
   - Optimization: Progress bar or step-by-step hints ("Loading Python environment...", "Starting gateway...", "Connecting...")

3. **Preload Python process** (complex, limited benefit)
   - Pre-launch Python process in background to reduce perceived latency

## Repositories

- **Primary (GitLab)**: `http://gitlab.lenovohuishang.com/baiying-ai/by-claw-nanobot2.git`
- **Mirror (GitHub)**: `https://github.com/qiuyanlong16/codex--.git`

---
---

# 中文说明

## 简介

基于 nanobot 的 Electron 桌面产品，将 nanobot AI Agent 打包为开箱即用的 Windows 安装程序。

## 架构

```
Electron (by-claw-nanobot)
├── 主进程 (packages/shell)
│   ├── 启动 nanobot gateway (Python, WebSocket 端口 8765 / 健康检查端口 18790)
│   ├── 管理 nanobot 进程生命周期
│   └── 通过 IPC 与渲染进程通信
└── 渲染进程 (packages/web)
    └── React WebUI（从 nanobot 仓库同步）
        ├── HTTP API  → http://127.0.0.1:18790/api/...
        └── WebSocket → ws://127.0.0.1:8765/ws
```

- **Shell**: Electron 42 主进程，管理 nanobot 进程的启动、健康检查、停止
- **WebUI**: 从 nanobot 源码同步的 React 应用，Vite 构建，支持主题切换 / 国际化
- **Python 后端**: nanobot 以 gateway 模式运行，CORS 允许 Electron 来源
- **安装包**: NSIS 安装程序，内置 Python venv（用户无需安装 Python）

## 目录结构

```
by-claw-nanobot/
├── packages/
│   ├── shared/          # @byclaw-nanobot/shared — IPC 通道 / 类型定义
│   ├── shell/           # @byclaw-nanobot/shell  — Electron 主进程
│   └── web/             # @byclaw-nanobot/web    — React WebUI（从 nanobot 同步）
├── vendor/
│   └── nanobot/         # nanobot 源码（git clone，已 gitignore）
├── scripts/
│   ├── build/           # 构建流水线脚本
│   ├── dev/             # 开发模式启动脚本
│   ├── diag/            # 诊断 / 修复脚本
│   └── policy/          # 日志策略
├── resources/
│   ├── icons/           # 应用图标（托盘、安装程序）
│   ├── installer/       # NSIS 安装程序资源（侧栏图、Banner）
│   └── nanobot-config-template/  # nanobot 默认配置模板
└── electron-builder.yml # 安装程序打包配置
```

## 快速开始

```bash
# 前提：Node >= 22.16.0，pnpm >= 9.0.0，Python >= 3.12（用于创建 venv）
# 注意：当前打包流程仅支持 Windows

# 1. 克隆 nanobot 源码到 vendor/nanobot/
pnpm pack:clone-nanobot

# 2. 同步 React WebUI 到 packages/web/
pnpm pack:sync-webui

# 3. 安装 JS 依赖
pnpm install

# 4. 创建 Python venv（安装 nanobot + 所有 Python 依赖）
pnpm pack:create-venv

# 5. 构建 WebUI
pnpm build:web

# 6. 开发模式（Vite dev server + Electron 热重载）
pnpm dev

# 7. 构建完整安装包（一键执行上述所有步骤）
pnpm bundle
# 输出：dist-release/by-claw-nanobot-Setup-0.1.0-x64.exe
```

## 构建流水线

完整构建由 `scripts/build/build-all.mjs` 编排，步骤顺序：

| # | 步骤 | 脚本 | 输出 |
|---|------|------|------|
| 1 | 克隆 nanobot | `clone-nanobot.mjs` | `vendor/nanobot/` |
| 2 | 同步 WebUI 源码 | `sync-webui.mjs` | `packages/web/` |
| 3 | 构建 WebUI | `pnpm build:web` | `packages/web/dist/` |
| 4 | 构建 Electron shell | `pnpm build:shell` | `packages/shell/dist/` |
| 5 | 创建 Python venv | `create-python-venv.mjs` | `packages/shell/resources/python-venv/` |
| 6 | 打包 venv（分卷 tar） | `pack-python-venv.mjs` | `python-venv_*.tar` |
| 7 | NSIS 安装包 | `bundle-cached.mjs` | `dist-release/*.exe` |

**跳过特定步骤**（环境变量）：

| 变量 | 说明 |
|------|------|
| `BYCLAW_PACK_SKIP_CLONE=1` | 跳过克隆（使用现有 `vendor/`） |
| `BYCLAW_PACK_SKIP_VENV=1` | 跳过 venv 创建与打包 |
| `BYCLAW_PACK_SKIP_BUNDLE=1` | 跳过 electron-builder |
| `BYCLAW_NANOBOT_REPO=<url>` | 替换 nanobot 仓库地址（默认 GitHub） |
| `BYCLAW_NANOBOT_BRANCH=<name>` | 指定克隆分支（默认 `main`） |
| `BYCLAW_PYTHON_VENV_DIR=<path>` | 使用指定路径的 venv |

## 升级策略

- **WebUI**：`git pull vendor/nanobot` → `sync-webui` → 合并定制 → `build:web`
- **Python 后端**：`git pull vendor/nanobot` → `create-python-venv`

## 诊断工具

`scripts/diag/` 提供 Windows 环境诊断与修复脚本：

- `nanobot-startup-diagnostic.ps1` — 收集启动诊断信息
- `nanobot-fix-venv.ps1` — 修复 Python venv 问题

## 命名约定

| 维度 | 值 |
|------|------|
| 全局名称 | `by-claw-nanobot` |
| appId | `com.byclaw.nanobot` |
| npm scope | `@byclaw-nanobot/*` |
| 用户数据 | `%LOCALAPPDATA%/ByNanobot` |
| home 目录 | `~/.by-claw-nanobot` |
| 安装路径 | `C:\Program Files (x86)\ByNanobot\by-claw-nanobot` |

## 启动流程与性能

### 启动时间线（典型值）

| 阶段 | 耗时 | 说明 |
|------|------|------|
| Electron 启动 + 窗口创建 | ~50ms | 显示 "Starting nanobot..." loading |
| Python venv 加载 | ~2.7s | 加载 python.exe + nanobot 模块 |
| Git store 初始化 | ~0.9s | workspace git repo |
| Tool 注册 | **~7.7s** | 扫描 CLI apps、加载 19 个 tool 定义（**瓶颈**） |
| WebSocket + Health endpoint | ~0.6s | 启动 server |
| healthz / readyz 通过 | ~0.3s | 确认 gateway healthy |
| 加载 WebUI | ~0.5s | 从 gateway 8766 端口加载 |
| **总计** | **~12s** | |

### 瓶颈分析

主要瓶颈在 **nanobot Python 端的 tool 注册**（~7.7s），这是 nanobot 内部扫描 CLI apps、加载 tool 定义的过程，Electron 侧无法控制。

### 优化方向（TODO）

1. **WebUI 从 Electron 本地加载**（而非等待 gateway）
   - 当前：WebUI 从 gateway 8766 端口加载，必须等 gateway 完全启动
   - 优化：从 Electron 本地 `packages/web/dist` 加载 HTML/JS/CSS，WebSocket 异步连接 gateway
   - 效果：窗口立即显示 WebUI 界面（带 loading 状态），用户感知启动时间 < 1s

2. **显示进度指示器**
   - 当前：静态 "Starting nanobot..." 文本
   - 优化：带进度条或阶段性提示（"加载 Python 环境..."、"启动 gateway..."、"连接中..."）

3. **预加载 Python 进程**（复杂，收益有限）
   - 在后台预启动 Python 进程，减少感知延迟

## 仓库

- **主仓库 (GitLab)**: `http://gitlab.lenovohuishang.com/baiying-ai/by-claw-nanobot2.git`
- **镜像仓库 (GitHub)**: `https://github.com/qiuyanlong16/codex--.git`
