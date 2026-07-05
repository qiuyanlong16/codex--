# 参与贡献 codex--

感谢你对 codex-- 的关注。本文说明如何搭建开发环境、提交改动以及 PR 合并流程。

English version: [CONTRIBUTING.md](./CONTRIBUTING.md)

## 行为准则

保持尊重与建设性，对事不对人。

## 开始之前

### 环境要求

| 工具   | 版本       | 说明                           |
| ------ | ---------- | ------------------------------ |
| Node.js | >= 22.16.0 | Electron 与 WebUI 构建         |
| pnpm   | >= 9.0.0   | 包管理器（`corepack enable`）  |
| Python | >= 3.12    | 仅构建 Python venv 时需要      |
| Git    | 最新       |                                |

**跨平台构建：**

- Windows 安装包 → 在 **Windows** 上构建（或 CI `windows-latest`）
- macOS 安装包 → 在 **macOS** 上构建（或 CI `macos-latest`）
- **禁止**混用两个平台的 Python 运行时产物（详见 README）

### Fork 与克隆

```bash
git clone https://github.com/qiuyanlong16/codex--.git
cd codex--
pnpm install
pnpm pack:clone-nanobot
pnpm pack:sync-webui
```

### 本地开发

```bash
# 完整开发环境（Vite + Electron 热重载）
pnpm dev

# 仅 WebUI
pnpm dev:web

# 运行测试
pnpm --filter @byclaw-nanobot/web test
```

## 分支策略

| 分支              | 用途                     |
| ----------------- | ------------------------ |
| `main` / `master` | 稳定发布线               |
| `feat/*`, `fix/*` | 功能与修复分支           |

1. 从最新的 `main`（或维护者指定的分支）切出功能分支。
2. 尽量保持 PR 聚焦，一次 PR 解决一个逻辑问题。
3. 提 PR 前与上游同步，减少冲突。

## Pull Request 流程

1. **大改动建议先开 Issue**，讨论方案再写代码。
2. **创建分支**，命名清晰，例如 `fix/mac-sidebar-padding`。
3. **提交改动**，本地尽量跑通相关测试。
4. **Commit 信息**遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
   - `feat(web): add dark mode toggle to settings`
   - `fix(mac): remove top chrome inset on darwin`
   - `docs: update macOS install steps`
5. **打开 PR** 到 `main`，填写 PR 模板。
6. **CI 必须通过** — 对 `main` / `master` 的 PR 会跑测试与平台构建。
7. 维护者 Review 后合并。

### Review 关注点

- 改动范围尽量小，避免无关重构
- 遵循现有代码风格与命名
- 用户可见行为变更需同步 README / i18n
- 不要提交密钥、API Key 或本地配置
- 跨平台改动：修 Mac 不能破坏 Windows，反之亦然

## 项目结构（贡献者参考）

```
packages/
  shared/   # 主进程与渲染进程共享的 IPC 类型
  shell/    # Electron 主进程
  web/      # React WebUI（部分从 nanobot 同步）
scripts/
  build/    # 打包流水线
  dev/      # 开发启动脚本
  diag/     # 诊断脚本
vendor/
  nanobot/  # 构建时克隆（已 gitignore）
```

### 常用命令

| 任务                 | 命令 / 位置                                 |
| -------------------- | ------------------------------------------- |
| 从 nanobot 同步 WebUI | `pnpm pack:sync-webui`                      |
| 重建 Python venv     | `pnpm pack:create-venv`                     |
| 完整安装包构建       | `pnpm bundle`                               |
| WebUI 单元测试       | `pnpm --filter @byclaw-nanobot/web test`    |
| Mac venv 修复脚本    | `node scripts/diag/nanobot-fix-venv-mac.mjs` |

## 报告 Bug

请提供：

- 操作系统与 CPU 架构（如 macOS 14 arm64、Windows 11 x64）
- codex-- 版本或 commit SHA
- 复现步骤
- 日志路径：
  - **macOS：** `~/Library/Application Support/ByNanobot/main.log`
  - **Windows：** `%LOCALAPPDATA%\ByNanobot\main.log`

## 发布与版本

版本号在根目录 `package.json`（当前 **1.0.0**）。维护者打 tag 如 `v1.0.0`。推送 tag 后 CI 会构建各平台安装包（见 `.github/workflows/release.yml`）。

## 提问

可在 [GitHub Issues](https://github.com/qiuyanlong16/codex--/issues) 提问，或在 PR 中讨论。
