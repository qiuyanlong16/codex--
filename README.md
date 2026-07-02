# by-claw-nanobot

基于 nanobot 的 Electron 桌面应用，替换原 OpenClaw 后端。

## 架构

**方案 C: Electron file:// + Python API**

```
Electron (by-claw-nanobot)
├── Splash 页面 (file://)
├── 启动 nanobot gateway (Python, 端口 8765)
└── 加载 nanobot WebUI (file://.../packages/web/dist/index.html)
    ├── HTTP API → http://127.0.0.1:8765/api/...
    └── WebSocket → ws://127.0.0.1:8765/ws
```

- **WebUI**: 从 nanobot 源码拷贝，Vite 构建，Electron 通过 file:// 加载
- **Python 后端**: nanobot 以 gateway 模式运行（API-only），CORS 允许 file:// 来源
- **Python 打包**: 独立虚拟环境安装包，用户开箱即用

## 目录结构

```
by-claw-nanobot/
├── packages/
│   ├── shared/          # @byclaw-nanobot/shared - 类型定义
│   ├── shell/           # @byclaw-nanobot/shell - Electron 主进程
│   └── web/             # @byclaw-nanobot/web - nanobot WebUI
├── vendor/
│   └── nanobot/         # nanobot 源码 (git clone)
├── scripts/
│   └── build/           # 构建脚本
└── resources/           # 图标、安装器
```

## 开发

```bash
# 1. 克隆 nanobot 源码
pnpm pack:clone-nanobot

# 2. 同步 WebUI 到 packages/web/
pnpm pack:sync-webui

# 3. 安装依赖
pnpm install

# 4. 开发模式
pnpm dev

# 5. 构建
pnpm build

# 6. 打包安装包
pnpm bundle
```

## 构建流程

1. `clone-nanobot.mjs` — 克隆 nanobot 源码到 vendor/
2. `sync-webui.mjs` — 从 vendor/nanobot/webui/ 同步到 packages/web/src/
3. `create-python-venv.mjs` — 创建 Python 虚拟环境
4. `bundle-cached.mjs` — 编排完整构建流程

## 升级策略

- **WebUI**: `git pull` vendor/nanobot → `sync-webui` → 合并定制 → `build:web`
- **Python**: `git pull` vendor/nanobot → `create-python-venv`

## 环境变量

| 变量                     | 说明              |
| ------------------------ | ----------------- |
| `BYCLAW_NANOBOT_REPO`    | nanobot 仓库地址  |
| `BYCLAW_NANOBOT_BRANCH`  | 分支（默认 main） |
| `BYCLAW_PACK_SKIP_CLONE` | 跳过克隆          |
| `BYCLAW_PYTHON_VENV_DIR` | 指定已有 venv     |
| `BYCLAW_PACK_SKIP_VENV`  | 跳过创建 venv     |

## 命名约定

| 维度      | 值                                               |
| --------- | ------------------------------------------------ |
| 全局名称  | by-claw-nanobot                                  |
| appId     | com.byclaw.nanobot                               |
| npm scope | @byclaw-nanobot/\*                               |
| 用户数据  | %LOCALAPPDATA%/ByNanobot                         |
| home 目录 | ~/.by-claw-nanobot                               |
| 安装路径  | C:\Program Files (x86)\ByNanobot\by-claw-nanobot |
