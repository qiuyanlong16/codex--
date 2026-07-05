<div align="center">

# codex--

**Desktop AI agent powered by [nanobot](https://github.com/nanobot-ai/nanobot)**

Ready-to-use **Windows** and **macOS** installers — no Python setup required.

**English** | [中文](./README_CN.md)

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](./package.json)
[![Node](https://img.shields.io/badge/node-%3E%3D22.16.0-green)](./package.json)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#)

[Download](#download--install) · [Contributing](./CONTRIBUTING.md) · [Report a bug](https://github.com/qiuyanlong16/codex--/issues)

</div>

---

## Overview

codex-- wraps the nanobot AI Agent in an Electron desktop shell. It ships a self-contained Python runtime, a React WebUI, and one-click installers for end users. Developers can fork the repo, customize the WebUI or agent workspace, and open pull requests — see [CONTRIBUTING.md](./CONTRIBUTING.md).

```
Electron (codex--)
├── Main Process (packages/shell)
│   ├── Starts nanobot gateway (Python, WS :8765 / health :18790)
│   ├── Manages process lifecycle
│   └── IPC with renderer
└── Renderer (packages/web)
    └── React WebUI
        ├── HTTP  → http://127.0.0.1:18790/api/...
        └── WS    → ws://127.0.0.1:8765/ws
```

| Component      | Description                                              |
| -------------- | -------------------------------------------------------- |
| **Shell**      | Electron 42 main process — startup, health, shutdown     |
| **WebUI**      | React + Vite, theme + i18n                             |
| **Backend**    | nanobot gateway mode, bundled Python venv                |
| **Installers** | Windows NSIS `.exe` / macOS unsigned `.dmg`              |

---

## Download & Install

### Release artifacts (v1.0.0)

| Platform              | Architecture | Artifact                         | Status        |
| --------------------- | ------------ | -------------------------------- | ------------- |
| **Windows**           | x64          | `codex---Setup-1.0.0-x64.exe`    | ✅ Available  |
| **macOS**             | arm64 (Apple Silicon M1/M2/M3/M4) | `codex---1.0.0-arm64.dmg` | ✅ Available  |
| macOS Intel (x64)     | x64          | —                                | ❌ Not built yet |

**Where to download**

1. **GitHub Releases** (recommended after tagging `v1.0.0`) — [Releases page](https://github.com/qiuyanlong16/codex--/releases)
2. **GitHub Actions artifacts** — open the latest green [Build workflow](https://github.com/qiuyanlong16/codex--/actions/workflows/build.yml) run → download `codex---windows-x64` or `codex---macos-arm64`

> **Note:** macOS builds are **Apple Silicon (arm64) only** for now. Intel Mac users need to build from source or wait for a future x64 release.

---

### Windows

1. Download `codex---Setup-1.0.0-x64.exe`
2. Run the installer (NSIS wizard)
3. Launch **codex--** from Start Menu or desktop shortcut
4. Default install path: `C:\Program Files (x86)\Codex--\codex--`

**Logs:** `%LOCALAPPDATA%\ByNanobot\main.log`

---

### macOS (Apple Silicon)

The macOS `.dmg` is **unsigned**. Gatekeeper may block the first launch. Follow these steps:

#### 1. Install

1. Download `codex---1.0.0-arm64.dmg`
2. Open the DMG and drag **codex--** into **Applications**

#### 2. Remove quarantine (required)

```bash
sudo xattr -dr com.apple.quarantine /Applications/codex--.app
```

This clears the "downloaded from the internet" flag so macOS stops blocking the app.

#### 3. Privacy & Security (if still blocked)

1. Open **System Settings → Privacy & Security**
2. Scroll to **Security** — if you see *"codex-- was blocked"*, click **Open Anyway**
3. Alternatively: **Finder → Applications → right-click codex-- → Open** (first launch only)

#### 4. Optional permissions

Depending on your agent setup, you may need to grant:

- **Files and Folders** — workspace access under `~/.nanobot/`
- **Local Network** — gateway listens on `127.0.0.1`

Configure under **System Settings → Privacy & Security** if prompted.

#### 5. First launch

- First startup may take ~10–15 s while the bundled Python venv extracts
- User data: `~/.by-claw-nanobot/`
- Config: `~/.nanobot/config.json`
- Logs: `~/Library/Application Support/ByNanobot/main.log`

#### Clean reinstall (troubleshooting)

```bash
# Quit the app first, then:
rm -rf ~/.by-claw-nanobot
rm -rf ~/Library/Application\ Support/ByNanobot
# Reinstall from a fresh .dmg — do NOT delete venv while using an old .dmg
```

---

## First Run — Configure Your Agent

1. Open **Settings** and configure your model provider (including **OpenAI Codex** via `openai_codex`)
2. Edit agent files under `~/.nanobot/workspace/`:
   - `AGENTS.md` — behavior instructions
   - `SOUL.md` — personality / tone
   - `USER.md` — your profile (auto-filled on first run)
3. Gateway config: `~/.nanobot/config.json`
4. Optional CLI:
   - Windows: `~/.by-claw-nanobot/nanobot.cmd`
   - macOS: `~/.by-claw-nanobot/bin/nanobot`

Skills, MCP tools, and subagents are managed in the WebUI Settings panel.

---

## For Contributors

We welcome pull requests. Please read **[CONTRIBUTING.md](./CONTRIBUTING.md)** before opening a PR.

**Quick dev setup:**

```bash
git clone https://github.com/qiuyanlong16/codex--.git
cd codex--
pnpm install
pnpm pack:clone-nanobot
pnpm pack:sync-webui
pnpm pack:create-venv   # requires Python >= 3.12
pnpm dev                # Vite + Electron hot reload
```

**Tests:**

```bash
pnpm build:shared
pnpm --filter @byclaw-nanobot/web test
```

**PR checklist:** focused diff · CI green · cross-platform safe · update docs/i18n when needed.

---

## Project Structure

```
codex--/
├── packages/
│   ├── shared/          # @byclaw-nanobot/shared — IPC types
│   ├── shell/           # @byclaw-nanobot/shell  — Electron main
│   └── web/             # @byclaw-nanobot/web    — React WebUI
├── vendor/nanobot/      # Cloned at build time (gitignored)
├── scripts/
│   ├── build/           # Packaging pipeline
│   ├── dev/             # Dev launchers
│   └── diag/            # Diagnostic / repair scripts
├── resources/           # Icons, installer assets, config template
└── electron-builder.yml
```

---

## Build from Source

```bash
# Prerequisites: Node >= 22.16.0, pnpm >= 9.0.0, Python >= 3.12

pnpm pack:clone-nanobot
pnpm pack:sync-webui
pnpm install
pnpm pack:create-venv
pnpm build:web
pnpm dev              # dev mode
pnpm bundle           # full installer
```

**Output:**

- Windows: `dist-release/codex---Setup-1.0.0-x64.exe`
- macOS: `dist-release/codex---1.0.0-arm64.dmg`

---

## ⚠️ Cross-Platform Packaging

**Windows installers must be built on Windows; macOS installers on macOS.** Python runtimes are **not interchangeable**.

| Platform | Build env                         | Artifact      | Python strategy                                      |
| -------- | --------------------------------- | ------------- | ---------------------------------------------------- |
| Windows  | `windows-latest` or local Windows | `.exe` (NSIS) | Embedded `python.exe` + DLLs, `python313._pth`     |
| macOS    | `macos-latest` or local Mac       | `.dmg`        | Embedded `Python.app` + dylibs, `install_name_tool` |

**Do not:**

- ❌ Build `.dmg` on Windows or `.exe` on macOS
- ❌ Copy Windows `python-venv_*.tar` into a Mac build (or vice versa)
- ❌ Delete `~/.by-claw-nanobot/resources/python-venv` while using an **old** `.dmg`

**CI:** Pushes and PRs to `main` / `master` trigger `.github/workflows/build.yml`. Tag pushes (`v*`) trigger `.github/workflows/release.yml` and publish GitHub Releases.

**Platform env vars:**

| Variable                 | Values                                                     |
| ------------------------ | ---------------------------------------------------------- |
| `BYCLAW_TARGET_PLATFORM` | `win32` (default on Windows) / `darwin` (default on macOS) |
| `BYCLAW_TARGET_ARCH`     | `x64` / `arm64`                                            |

---

## Build Pipeline

Orchestrated by `scripts/build/build-all.mjs`:

| # | Step              | Script                   | Output                                  |
| - | ----------------- | ------------------------ | --------------------------------------- |
| 1 | Clone nanobot     | `clone-nanobot.mjs`      | `vendor/nanobot/`                       |
| 2 | Sync WebUI        | `sync-webui.mjs`         | `packages/web/`                         |
| 3 | Build WebUI       | `pnpm build:web`         | `packages/web/dist/`                    |
| 4 | Build shell       | `pnpm build:shell`       | `packages/shell/dist/`                  |
| 5 | Create venv       | `create-python-venv.mjs` | `packages/shell/resources/python-venv/` |
| 6 | Pack venv         | `pack-python-venv.mjs`   | `python-venv_*.tar`                     |
| 7 | electron-builder  | `bundle-cached.mjs`      | `dist-release/*.exe` or `*.dmg`         |

**Skip steps** via env vars: `BYCLAW_PACK_SKIP_CLONE=1`, `BYCLAW_PACK_SKIP_VENV=1`, `BYCLAW_PACK_SKIP_BUNDLE=1`.

---

## Troubleshooting

### macOS: `Library not loaded: ... Python.framework ...`

Older installers shipped venv shards without a fully embedded Python runtime.

**Fix:** Install a **new** `.dmg` from CI/Releases (includes `python-darwin-runtime`). Or run:

```bash
node scripts/diag/nanobot-fix-venv-mac.mjs
```

### macOS: app won't open / "damaged"

Run the quarantine command again:

```bash
sudo xattr -dr com.apple.quarantine /Applications/codex--.app
```

Then **System Settings → Privacy & Security → Open Anyway**.

### Diagnostic scripts

| Script                          | Platform |
| ------------------------------- | -------- |
| `nanobot-startup-diagnostic.ps1`| Windows  |
| `nanobot-fix-venv.ps1`          | Windows  |
| `nanobot-fix-venv-mac.mjs`      | macOS    |

---

## Naming Conventions

| Item                   | Value                                    |
| ---------------------- | ---------------------------------------- |
| Product name           | `codex--`                                |
| appId                  | `com.codex--.app`                        |
| npm scope              | `@byclaw-nanobot/*`                      |
| User data (Windows)    | `%LOCALAPPDATA%/ByNanobot`               |
| User data (macOS)      | `~/Library/Application Support/ByNanobot`|
| Home / runtime (both)  | `~/.by-claw-nanobot`                     |

---

## Repositories

| Remote   | URL                                                              |
| -------- | ---------------------------------------------------------------- |
| GitHub   | https://github.com/qiuyanlong16/codex--.git                      |
| GitLab   | http://gitlab.lenovohuishang.com/baiying-ai/by-claw-nanobot2.git |

---

## Changelog

### v1.0.0

- First public release
- Windows x64 NSIS installer
- macOS Apple Silicon (arm64) unsigned DMG with portable Python runtime
- Cross-platform Electron shell with native macOS title bar layout
- GitHub Actions CI for Windows + macOS builds
