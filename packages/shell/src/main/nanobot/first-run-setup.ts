import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import { getByclawHomeDir, resolveResourcesPath } from "../core/platform-paths.js";
import { venvPythonPath } from "../core/venv-paths.js";
import { mainLog } from "../core/logging/main-logger.js";

const SETUP_MARKER = "setup-complete.json";

function copyFileIfMissing(src: string, dest: string): void {
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function resolveConfigTemplateDir(): string | null {
  const resourcesPath = resolveResourcesPath();
  const candidates = [
    resourcesPath ? path.join(resourcesPath, "nanobot-config-template") : null,
    path.join(app.getAppPath(), "resources", "nanobot-config-template"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "config.json"))) {
      return candidate;
    }
  }
  return null;
}

function personalizeUserMd(userMdPath: string): void {
  if (!fs.existsSync(userMdPath)) return;
  const username = os.userInfo().username || process.env.USERNAME || process.env.USER || "";
  if (!username) return;
  const content = fs.readFileSync(userMdPath, "utf8");
  if (!content.includes("(your name)")) return;
  fs.writeFileSync(userMdPath, content.replace(/\(your name\)/g, username), "utf8");
}

function writeCliWrapper(homeDir: string, venvDir: string): void {
  const pythonExe = venvPythonPath(venvDir);
  if (process.platform === "win32") {
    const cmdPath = path.join(homeDir, "nanobot.cmd");
    const content = `@echo off\r\nset VENV_DIR=${venvDir.replace(/\\/g, "\\\\")}\r\n"%VENV_DIR%\\Scripts\\python.exe" -m nanobot %*\r\n`;
    fs.writeFileSync(cmdPath, content, "utf8");
    return;
  }

  const binDir = path.join(homeDir, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, "nanobot");
  const content = `#!/bin/sh\nexec "${pythonExe}" -m nanobot "$@"\n`;
  fs.writeFileSync(scriptPath, content, { mode: 0o755 });
}

/**
 * Idempotent first-run setup mirroring NSIS customInstall on Windows.
 * Safe to call on every packaged startup.
 */
export async function runFirstRunSetup(): Promise<void> {
  if (!app.isPackaged) return;

  const homeDir = getByclawHomeDir();
  const markerPath = path.join(homeDir, SETUP_MARKER);
  const venvDir = path.join(homeDir, "resources", "python-venv");
  const nanobotDir = path.join(os.homedir(), ".nanobot");
  const workspaceDir = path.join(nanobotDir, "workspace");
  const memoryDir = path.join(workspaceDir, "memory");
  const templateDir = resolveConfigTemplateDir();

  try {
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(nanobotDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(memoryDir, { recursive: true });

    if (templateDir) {
      const configDest = path.join(nanobotDir, "config.json");
      const configSrc = path.join(templateDir, "config.json");
      if (!fs.existsSync(markerPath) && fs.existsSync(configSrc)) {
        fs.copyFileSync(configSrc, configDest);
      } else if (!fs.existsSync(configDest) && fs.existsSync(configSrc)) {
        fs.copyFileSync(configSrc, configDest);
      }

      const workspaceTemplate = path.join(templateDir, "workspace");
      if (fs.existsSync(workspaceTemplate)) {
        for (const file of ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "USER.md"]) {
          copyFileIfMissing(
            path.join(workspaceTemplate, file),
            path.join(workspaceDir, file),
          );
        }
      }
    }

    personalizeUserMd(path.join(workspaceDir, "USER.md"));

    const memoryMd = path.join(memoryDir, "MEMORY.md");
    if (!fs.existsSync(memoryMd)) {
      fs.writeFileSync(memoryMd, "# Memory\n", "utf8");
    }
    const history = path.join(memoryDir, "history.jsonl");
    if (!fs.existsSync(history)) {
      fs.writeFileSync(history, "", "utf8");
    }

    if (fs.existsSync(venvPythonPath(venvDir))) {
      writeCliWrapper(homeDir, venvDir);
    } else {
      mainLog.warn("setup", "python venv not found yet; CLI wrapper skipped", { venvDir });
    }

    fs.writeFileSync(
      markerPath,
      JSON.stringify({ completedAt: new Date().toISOString(), product: app.getName() }, null, 2),
      "utf8",
    );
    mainLog.info("setup", "first-run setup complete");
  } catch (err) {
    mainLog.warn("setup", "first-run setup failed", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
