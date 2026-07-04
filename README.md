<div align="center">

**English** | [中文](./README_CN.md)

</div>

# codex--

An Electron desktop product based on nanobot, packaging the nanobot AI Agent into ready-to-use **Windows** and **macOS** installers.

## Architecture

```
Electron (codex--)
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
- **Installer**: Windows NSIS `.exe` or macOS unsigned `.dmg` with bundled Python venv (no Python install required)

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
# Build Windows on Windows; build macOS on macOS (or use GitHub Actions)

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
# Output: dist-release/codex---Setup-0.1.0-x64.exe  (Windows)
#         dist-release/codex---0.1.0-arm64.dmg     (macOS)
```

**macOS unsigned install:** drag to Applications, then Right-click → Open (or `xattr -cr /Applications/codex--.app`).

**Platform env vars** (for `bundle-cached.mjs`):

| Variable                 | Values                                                     |
| ------------------------ | ---------------------------------------------------------- |
| `BYCLAW_TARGET_PLATFORM` | `win32` (default on Windows) / `darwin` (default on macOS) |
| `BYCLAW_TARGET_ARCH`     | `x64` / `arm64`                                            |

## Build Pipeline

The full build is orchestrated by `scripts/build/build-all.mjs`, in the following order:

| #   | Step                  | Script                   | Output                                  |
| --- | --------------------- | ------------------------ | --------------------------------------- |
| 1   | Clone nanobot         | `clone-nanobot.mjs`      | `vendor/nanobot/`                       |
| 2   | Sync WebUI source     | `sync-webui.mjs`         | `packages/web/`                         |
| 3   | Build WebUI           | `pnpm build:web`         | `packages/web/dist/`                    |
| 4   | Build Electron shell  | `pnpm build:shell`       | `packages/shell/dist/`                  |
| 5   | Create Python venv    | `create-python-venv.mjs` | `packages/shell/resources/python-venv/` |
| 6   | Pack venv (split tar) | `pack-python-venv.mjs`   | `python-venv_*.tar`                     |
| 7   | electron-builder      | `bundle-cached.mjs`      | `dist-release/*.exe` or `*.dmg`         |

**Skip specific steps** (environment variables):

| Variable                        | Description                                    |
| ------------------------------- | ---------------------------------------------- |
| `BYCLAW_PACK_SKIP_CLONE=1`      | Skip cloning (use existing `vendor/`)          |
| `BYCLAW_PACK_SKIP_VENV=1`       | Skip venv creation and packing                 |
| `BYCLAW_PACK_SKIP_BUNDLE=1`     | Skip electron-builder                          |
| `BYCLAW_NANOBOT_REPO=<url>`     | Override nanobot repo URL (defaults to GitHub) |
| `BYCLAW_NANOBOT_BRANCH=<name>`  | Specify branch to clone (defaults to `main`)   |
| `BYCLAW_PYTHON_VENV_DIR=<path>` | Use a venv at the specified path               |

## Upgrade Strategy

- **WebUI**: `git pull vendor/nanobot` → `sync-webui` → merge customizations → `build:web`
- **Python Backend**: `git pull vendor/nanobot` → `create-python-venv`

## Diagnostic Tools

`scripts/diag/` provides Windows environment diagnostic and repair scripts:

- `nanobot-startup-diagnostic.ps1` — Collects startup diagnostics
- `nanobot-fix-venv.ps1` — Fixes Python venv issues

## Naming Conventions

| Dimension              | Value                                    |
| ---------------------- | ---------------------------------------- |
| Product name           | `codex--`                                |
| appId                  | `com.codex--.app`                        |
| npm scope (internal)   | `@byclaw-nanobot/*`                      |
| User data              | `%LOCALAPPDATA%/ByNanobot`               |
| Home directory         | `~/.by-claw-nanobot`                     |
| Install path (Windows) | `C:\Program Files (x86)\Codex--\codex--` |

## Startup Flow & Performance

### Startup Timeline (Typical Values)

| Phase                             | Duration  | Notes                                                      |
| --------------------------------- | --------- | ---------------------------------------------------------- |
| Electron launch + window creation | ~50ms     | Shows "Starting nanobot..." loading screen                 |
| Python venv loading               | ~2.7s     | Loads python.exe + nanobot modules                         |
| Git store initialization          | ~0.9s     | Workspace git repo                                         |
| Tool registration                 | **~7.7s** | Scans CLI apps, loads 19 tool definitions (**bottleneck**) |
| WebSocket + health endpoint       | ~0.6s     | Starts server                                              |
| healthz / readyz pass             | ~0.3s     | Confirms gateway is healthy                                |
| Load WebUI                        | ~0.5s     | Loads from gateway port 8766                               |
| **Total**                         | **~12s**  |                                                            |

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

## Build Your Own Agent

codex-- ships with a default nanobot workspace so you can customize your local agent immediately:

1. **Install** codex-- (Windows `.exe` or Mac `.dmg`)
2. **Configure models** in Settings — including **OpenAI Codex** (`openai_codex` provider)
3. **Edit agent files** under `~/.nanobot/workspace/`:
   - `AGENTS.md` — agent behavior instructions
   - `SOUL.md` — personality / tone
   - `USER.md` — your profile (auto-filled on first run)
4. **Adjust gateway config** at `~/.nanobot/config.json` (seeded from `resources/nanobot-config-template/`)
5. **Use CLI** (optional): `~/.by-claw-nanobot/nanobot.cmd` (Windows) or `~/.by-claw-nanobot/bin/nanobot` (Mac)

Skills, MCP tools, and subagents are configured through the WebUI Settings panel and nanobot config.

## Repositories

- **Primary (GitLab)**: `http://gitlab.lenovohuishang.com/baiying-ai/by-claw-nanobot2.git`
- **GitHub (cross-platform)**: `https://github.com/qiuyanlong16/codex--.git`
