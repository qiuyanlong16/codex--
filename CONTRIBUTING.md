# Contributing to codex--

Thank you for your interest in contributing. This document explains how to set up the project, propose changes, and get your pull request merged.

**中文说明**见 [CONTRIBUTING_CN.md](./CONTRIBUTING_CN.md)。

## Code of Conduct

Be respectful and constructive. Focus on the problem, not the person.

## Getting Started

### Prerequisites

| Tool    | Version        | Notes                                      |
| ------- | -------------- | ------------------------------------------ |
| Node.js | >= 22.16.0     | Required for Electron shell and WebUI      |
| pnpm    | >= 9.0.0       | Package manager (`corepack enable`)        |
| Python  | >= 3.12        | Only needed when building the Python venv  |
| Git     | latest         |                                            |

**Platform-specific builds:**

- Windows installers → build on **Windows** (or CI `windows-latest`)
- macOS installers → build on **macOS** (or CI `macos-latest`)
- Do **not** mix platform artifacts (see README cross-platform section)

### Fork & Clone

```bash
git clone https://github.com/qiuyanlong16/codex--.git
cd codex--
pnpm install
pnpm pack:clone-nanobot
pnpm pack:sync-webui
```

### Development

```bash
# Full dev stack (Vite + Electron hot reload)
pnpm dev

# WebUI only
pnpm dev:web

# Run tests
pnpm --filter @byclaw-nanobot/web test
```

## Branch Strategy

| Branch               | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `main` / `master`    | Stable release line                          |
| `feat/*`, `fix/*`    | Feature and bugfix branches                  |

1. Branch from the latest `main` (or the branch maintainers specify).
2. Keep PRs focused — one logical change per PR when possible.
3. Rebase or merge from upstream before requesting review.

## Pull Request Process

1. **Open an issue first** (recommended) for large changes — discuss approach before coding.
2. **Create a branch** with a clear name, e.g. `fix/mac-sidebar-padding`, `feat/settings-export`.
3. **Make your changes** and ensure tests pass locally when applicable.
4. **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(web): add dark mode toggle to settings`
   - `fix(mac): remove top chrome inset on darwin`
   - `docs: update macOS install steps`
5. **Open a PR** against `main` using the PR template.
6. **CI must pass** — GitHub Actions runs tests and platform builds on PRs to `main` / `master`.
7. A maintainer will review and merge.

### What We Look For

- Minimal, focused diffs — avoid unrelated refactors in the same PR
- Match existing code style and naming conventions
- Update README / i18n when user-facing behavior changes
- Do not commit secrets, API keys, or local config files
- Cross-platform changes must not break Windows when fixing macOS (and vice versa)

## Project Layout (for contributors)

```
packages/
  shared/   # IPC types shared between main and renderer
  shell/    # Electron main process
  web/      # React WebUI (partially synced from nanobot)
scripts/
  build/    # Packaging pipeline
  dev/      # Dev launchers
  diag/     # Diagnostic scripts
vendor/
  nanobot/  # Cloned at build time (gitignored)
```

### Common Tasks

| Task                    | Command / location                          |
| ----------------------- | ------------------------------------------- |
| Sync WebUI from nanobot | `pnpm pack:sync-webui`                      |
| Rebuild Python venv     | `pnpm pack:create-venv`                       |
| Full installer build    | `pnpm bundle`                               |
| WebUI unit tests        | `pnpm --filter @byclaw-nanobot/web test`    |
| Mac venv repair script  | `node scripts/diag/nanobot-fix-venv-mac.mjs`  |

## Reporting Bugs

Include:

- OS and CPU architecture (e.g. macOS 14 arm64, Windows 11 x64)
- codex-- version or commit SHA
- Steps to reproduce
- Logs from:
  - **macOS:** `~/Library/Application Support/ByNanobot/main.log`
  - **Windows:** `%LOCALAPPDATA%\ByNanobot\main.log`

## Release & Versioning

Version is defined in the root `package.json` (currently **1.0.0**). Maintainers tag releases as `v1.0.0`, `v1.0.1`, etc. CI builds platform installers on tag push (see `.github/workflows/release.yml`).

## Questions

Open a [GitHub Issue](https://github.com/qiuyanlong16/codex--/issues) or discuss in your PR.
