import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { app } from "electron";
import { resolveResourcesPath, getByclawHomeDir } from "../core/platform-paths.js";
import { venvPythonPath, resolveSystemTarCandidates, fixPortablePyvenvCfg } from "../core/venv-paths.js";
import { ensureMacVenvPortable } from "../core/mac-venv-portable.js";
import { mainLog } from "../core/logging/main-logger.js";

export type NanobotBundleLayout = "packaged" | "dev-checkout";

export type NanobotBundleRef = {
  root: string;
  layout: NanobotBundleLayout;
  pythonExe: string;
  nanobotModulePath: string | null;
};

const DEV_ROOT_ENV = "BYCLAW_NANOBOT_DEV_ROOT";
const DEV_PYTHON_ENV = "BYCLAW_NANOBOT_DEV_PYTHON";

function findSitePackagesInVenv(venvRoot: string): string | null {
  const winPath = path.join(venvRoot, "Lib", "site-packages");
  if (fs.existsSync(winPath)) return winPath;
  const libDir = path.join(venvRoot, "lib");
  if (!fs.existsSync(libDir)) return null;
  for (const entry of fs.readdirSync(libDir)) {
    if (entry.startsWith("python")) {
      const candidate = path.join(libDir, entry, "site-packages");
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function pythonExecutableInDir(dir: string): string | null {
  // Standard venv layout (Windows Scripts/ or Unix bin/).
  const venvCandidate = venvPythonPath(dir);
  if (fs.existsSync(venvCandidate)) {
    return venvCandidate;
  }
  if (process.platform !== "win32") {
    const binDir = path.join(dir, "bin");
    for (const name of ["python3", "python"]) {
      const candidate = path.join(binDir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // Flat layout (python at bundle root).
  const searchDirs = [
    dir,
    path.join(dir, "Scripts"),
    path.join(dir, "bin"),
  ];
  const names =
    process.platform === "win32"
      ? ["python.exe", "python3", "python"]
      : ["python3", "python", "python.exe"];
  for (const searchDir of searchDirs) {
    for (const name of names) {
      const candidate = path.join(searchDir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function shellResourceCandidates(relativePath: string): string[] {
  const resourcesPath = resolveResourcesPath();
  const bundledMainDir = path.dirname(fileURLToPath(import.meta.url));
  const cwd = process.cwd();
  // Fallback: when the app is installed under Program Files the venv is
  // extracted to the user-writable state directory under resources/
  // (see ensureVenvExtracted).
  const fallbackVenv = path.join(getByclawHomeDir(), "resources", relativePath);
  return [
    resourcesPath ? path.join(resourcesPath, relativePath) : null,
    path.join(bundledMainDir, "../../resources", relativePath),
    path.join(cwd, "resources", relativePath),
    path.join(cwd, "packages", "shell", "resources", relativePath),
    fallbackVenv,
  ].filter((p): p is string => Boolean(p));
}

function devCheckoutCandidates(): string[] {
  const candidates: string[] = [];
  const envRoot = process.env[DEV_ROOT_ENV]?.trim();
  if (envRoot) {
    candidates.push(path.resolve(envRoot));
  }
  const bundledMainDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(bundledMainDir, "../../../..");
  // vendor/nanobot is the primary dev location (populated by pack:clone-nanobot)
  candidates.push(path.resolve(repoRoot, "vendor", "nanobot"));
  // Fallback: nanobot checked out next to by-claw-nanobot
  candidates.push(path.resolve(repoRoot, "../nanobot"));
  candidates.push(path.resolve(repoRoot, "nanobot"));
  return [...new Set(candidates)];
}

function resolvePackagedBundle(root: string): NanobotBundleRef | null {
  const pythonExe = pythonExecutableInDir(root);
  if (!pythonExe) return null;
  // Check for nanobot module
  const sitePackages = findSitePackagesInVenv(root);
  const nanobotModulePath = sitePackages
    ? path.join(sitePackages, "nanobot")
    : path.join(root, "Lib", "site-packages", "nanobot");
  const hasNanobot = fs.existsSync(nanobotModulePath) || fs.existsSync(path.join(root, "nanobot"));
  return {
    root,
    layout: "packaged",
    pythonExe,
    nanobotModulePath: hasNanobot ? nanobotModulePath : null,
  };
}

function resolveDevCheckoutBundle(root: string): NanobotBundleRef | null {
  const pythonExe = pythonExecutableInDir(root);
  if (!pythonExe) return null;
  return {
    root,
    layout: "dev-checkout",
    pythonExe,
    nanobotModulePath: path.join(root, "nanobot"),
  };
}

function devPythonOverride(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const override = process.env[DEV_PYTHON_ENV]?.trim();
  if (override && fs.existsSync(override)) return override;
  return null;
}

/**
 * Extract the python-venv from tar shards (async, non-blocking).
 *
 * In a packaged app the install dir is typically Program Files, which is not
 * writable by normal users.  We always extract into the user-writable state
 * directory (~/.by-claw-nanobot/resources/python-venv) using the system
 * tar.exe directly — no child-process unpack script, no bundled JS tar module.
 */
/** Run tar.exe asynchronously (non-blocking). */
function repairRuntimeDir(resourcesPath: string | null): string | null {
  if (!resourcesPath) return null;
  const dir = path.join(resourcesPath, "python-darwin-runtime");
  return fs.existsSync(dir) ? dir : null;
}

async function finalizeExtractedVenv(fallbackVenv: string, fallbackPython: string): Promise<void> {
  fixPortablePyvenvCfg(fallbackVenv);
  if (process.platform === "darwin") {
    const resourcesPath = resolveResourcesPath();
    try {
      ensureMacVenvPortable(fallbackVenv, repairRuntimeDir(resourcesPath));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      mainLog.error("nanobot", "macOS venv portability repair failed", { detail });
      throw err instanceof Error ? err : new Error(detail);
    }
  }
  const probe = await runCommandAsync(fallbackPython, ["--version"]);
  if (!probe.ok) {
    mainLog.error("nanobot", "venv python probe failed", {
      python: fallbackPython,
      stderr: probe.stderr,
      stdout: probe.stdout,
    });
    throw new Error(
      `venv_python_broken: cannot execute ${fallbackPython}${probe.stderr ? `: ${probe.stderr.trim()}` : ""}`,
    );
  }
  mainLog.info("nanobot", "venv ready", {
    fallbackVenv,
    pythonVersion: probe.stdout.trim(),
  });
}

export async function ensureVenvExtracted(): Promise<void> {
  const resourcesPath = resolveResourcesPath();
  if (!resourcesPath) return;

  // Target: always the user-writable state dir, never Program Files.
  const stateDir = getByclawHomeDir();
  const fallbackResources = path.join(stateDir, "resources");
  const fallbackVenv = path.join(fallbackResources, "python-venv");
  const fallbackPython = venvPythonPath(fallbackVenv);

  // Already extracted — still verify/repair (older builds shipped broken macOS venvs).
  if (fs.existsSync(fallbackPython)) {
    const probe = await runCommandAsync(fallbackPython, ["--version"]);
    if (probe.ok) return;
    mainLog.warn("nanobot", "existing venv python is broken; attempting macOS repair", {
      python: fallbackPython,
      stderr: probe.stderr.trim(),
    });
    if (process.platform === "darwin") {
      await finalizeExtractedVenv(fallbackVenv, fallbackPython);
      return;
    }
    throw new Error(
      `venv_python_broken: cannot execute ${fallbackPython}${probe.stderr ? `: ${probe.stderr.trim()}` : ""}`,
    );
  }

  // Check for tar shards in the packaged resources/
  const manifestPath = path.join(resourcesPath, "python-venv_manifest.json");
  let hasShards = false;
  try {
    hasShards =
      fs.existsSync(manifestPath) ||
      fs.readdirSync(resourcesPath).some((f) => /^python-venv_\d+\.tar$/.test(f));
  } catch {
    return;
  }
  if (!hasShards) return;

  mainLog.info("nanobot", "extracting venv to user state dir (async)", {
    target: fallbackVenv,
  });

  // A previous failed extract can leave bin/lib without a usable interpreter.
  if (!fs.existsSync(fallbackPython) && fs.existsSync(fallbackVenv)) {
    mainLog.warn("nanobot", "removing incomplete venv before re-extract", {
      fallbackVenv,
    });
    fs.rmSync(fallbackVenv, { recursive: true, force: true });
  }

  try {
    fs.mkdirSync(fallbackResources, { recursive: true });

    // Copy tar shards to the state dir (tar.exe extracts in-place).
    for (const entry of fs.readdirSync(resourcesPath)) {
      if (!/^python-venv(_\d+\.tar|_manifest\.json)$/.test(entry)) continue;
      const src = path.join(resourcesPath, entry);
      const dest = path.join(fallbackResources, entry);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }

    // Extract each shard using system tar.exe (async).
    const tarExe = await resolveSystemTarExe();
    if (!tarExe) {
      mainLog.error("nanobot", "system tar not found, cannot extract venv");
      return;
    }

    for (const entry of fs.readdirSync(fallbackResources)) {
      if (!/^python-venv_\d+\.tar$/.test(entry)) continue;
      const tarFile = path.join(fallbackResources, entry);
      const started = Date.now();
      try {
        await runTarAsync(tarExe, tarFile, fallbackResources);
        mainLog.info("nanobot", `extracted ${entry}`, {
          durationMs: Date.now() - started,
        });
        try { fs.unlinkSync(tarFile); } catch { /* ignore */ }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        mainLog.error("nanobot", `extraction failed for ${entry}`, {
          durationMs: Date.now() - started,
          detail,
        });
        throw new Error(`venv_extract_failed: ${entry}: ${detail}`);
      }
    }

    // Clean up manifest
    try { fs.unlinkSync(path.join(fallbackResources, "python-venv_manifest.json")); } catch { /* ignore */ }

    if (fs.existsSync(fallbackPython)) {
      await finalizeExtractedVenv(fallbackVenv, fallbackPython);
    } else {
      // List directory contents to help diagnose what went wrong
      let dirContents: string[] = [];
      let binContents: string[] = [];
      try { dirContents = fs.readdirSync(fallbackVenv); } catch { /* ignore */ }
      try { binContents = fs.readdirSync(path.join(fallbackVenv, "bin")); } catch { /* ignore */ }
      mainLog.error("nanobot", "venv extraction done but python interpreter missing", {
        fallbackVenv,
        dirContents,
        binContents,
      });
      throw new Error(`venv_extract_incomplete: python not found at ${fallbackPython}, dir contents: ${dirContents.join(", ") || "(empty)"}`);
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    mainLog.error("nanobot", "venv extraction failed", { detail });
    throw err instanceof Error ? err : new Error(detail);
  }
}

/** Run tar.exe asynchronously (non-blocking). */
function runTarAsync(tarExe: string, tarFile: string, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tarExe, ["-xf", tarFile, "-C", cwd], {
      windowsHide: process.platform === "win32",
    });
    let stderr = "";
    child.stderr?.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      const hasErrors =
        code !== 0 ||
        /Permission denied|Can't create|Cannot create/i.test(stderr);
      if (hasErrors) {
        reject(new Error(stderr || `tar exited ${code}`));
      } else {
        resolve();
      }
    });
    child.on("error", reject);
  });
}

/** Find a working tar.exe on the system (async). */
async function resolveSystemTarExe(): Promise<string | null> {
  for (const candidate of resolveSystemTarCandidates()) {
    try {
      if (candidate !== "tar" && candidate !== "tar.exe" && !fs.existsSync(candidate)) continue;
      const version = await runCommandAsync(candidate, ["--version"]);
      if (version.ok) return candidate;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Run a command asynchronously and return stdout, or null on failure. */
function runCommandAsync(
  cmd: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => { stdout += data.toString(); });
    child.stderr?.on("data", (data) => { stderr += data.toString(); });
    child.on("close", (code) => {
      resolve({ ok: code === 0, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve({ ok: false, stdout, stderr: err.message });
    });
  });
}

/** Resolve nanobot bundle (from user-provided zip or dev checkout). */
export async function resolveNanobotBundle(): Promise<NanobotBundleRef | null> {
  // Only attempt venv extraction in dev mode (installer handles it in production).
  // In production, if venv is missing, we return missing — no startup extraction.
  const shouldExtract = process.env.NODE_ENV === "development" || app.isPackaged;
  if (shouldExtract) {
    await ensureVenvExtracted();
  }

  // Check dev Python override first
  const devPython = devPythonOverride();
  if (devPython) {
    return {
      root: path.dirname(devPython),
      layout: "dev-checkout",
      pythonExe: devPython,
      nanobotModulePath: null,
    };
  }

  // Check packaged locations
  const packagedRoots = [
    ...shellResourceCandidates("python-venv"),
    ...shellResourceCandidates("nanobot-bundle"),
    ...shellResourceCandidates("python"),
  ];

  for (const root of packagedRoots) {
    const bundle = resolvePackagedBundle(root);
    if (bundle) return bundle;
  }

  // Check nanobot-bundle dir (user's zip extracted here)
  for (const root of shellResourceCandidates("nanobot-bundle")) {
    const bundle = resolvePackagedBundle(root);
    if (bundle) return bundle;
  }

  if (process.env.NODE_ENV === "development") {
    for (const root of devCheckoutCandidates()) {
      const bundle = resolveDevCheckoutBundle(root);
      if (bundle) return bundle;
    }
  }

  return null;
}

export function resolveNanobotPythonExecutable(bundleRef?: NanobotBundleRef | null): string | null {
  if (bundleRef?.pythonExe && fs.existsSync(bundleRef.pythonExe)) {
    return bundleRef.pythonExe;
  }

  // Search in resources
  for (const dir of shellResourceCandidates("python-venv")) {
    const exe = pythonExecutableInDir(dir);
    if (exe) return exe;
  }
  for (const dir of shellResourceCandidates("python")) {
    const exe = pythonExecutableInDir(dir);
    if (exe) return exe;
  }
  for (const dir of shellResourceCandidates("nanobot-bundle")) {
    const exe = pythonExecutableInDir(dir);
    if (exe) return exe;
  }

  return null;
}

export function describeNanobotBundle(bundle: NanobotBundleRef | null): string {
  if (!bundle) return "missing";
  return `${bundle.layout}@${bundle.root}`;
}

/**
 * Read the main server port (WebUI + API + WebSocket) from nanobot config.
 * The gateway's --port flag only controls the health-check server (18790);
 * the main server that serves the WebUI and API runs on a different port
 * (default 8765, configurable via channels.websocket.port in config.json).
 *
 * Returns 8765 if config can't be read (caller should use this default).
 */
export function resolveNanobotMainServerPort(): number {
  const configPath = path.join(os.homedir(), ".nanobot", "config.json");
  try {
    if (!fs.existsSync(configPath)) return 8765;
    const raw = fs.readFileSync(configPath, "utf8");
    const config = JSON.parse(raw);
    const wsPort = config?.channels?.websocket?.port;
    if (typeof wsPort === "number" && wsPort > 0) return wsPort;
  } catch { /* use default */ }
  return 8765;
}
