import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mainLog } from "./logging/main-logger.js";

const FRAMEWORK_PREFIX = "/Library/Frameworks/Python.framework/Versions/";

function pythonMinorFromLibVersion(pyVersion: string): string | null {
  const match = pyVersion.match(/^python(\d+\.\d+)$/);
  return match?.[1] ?? null;
}

function frameworkPythonRef(pyVersion: string): string {
  const minor = pythonMinorFromLibVersion(pyVersion);
  if (!minor) throw new Error(`invalid python lib version: ${pyVersion}`);
  return `${FRAMEWORK_PREFIX}${minor}/Python`;
}

function libpythonFileName(pyVersion: string): string {
  return `lib${pyVersion}.dylib`;
}

function isMachO(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    const magic = header.readUInt32BE(0);
    return magic === 0xcafebabe || magic === 0xbebafeca || magic === 0xfeedface || magic === 0xcefaedfe;
  } catch {
    return false;
  }
}

function runInstallNameTool(args: string[]): void {
  const result = spawnSync("install_name_tool", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`install_name_tool failed: ${detail}`);
  }
}

function changeFrameworkRef(filePath: string, frameworkRef: string, newRef: string): void {
  const probe = spawnSync("otool", ["-L", filePath], { encoding: "utf8" });
  if (probe.status !== 0 || !probe.stdout.includes(frameworkRef)) return;
  runInstallNameTool(["-change", frameworkRef, newRef, filePath]);
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function fixFrameworkRefsInTree(dir: string, frameworkRef: string, newRef: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fixFrameworkRefsInTree(full, frameworkRef, newRef);
      continue;
    }
    if (!entry.name.endsWith(".so") && !entry.name.endsWith(".dylib")) continue;
    if (!isMachO(full)) continue;
    changeFrameworkRef(full, frameworkRef, newRef);
  }
}

function signMachOFilesInTree(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      signMachOFilesInTree(full);
      continue;
    }
    if (!isMachO(full)) continue;
    fs.chmodSync(full, fs.statSync(full).mode | 0o755);
    spawnSync("codesign", ["-s", "-", "-f", full], { stdio: "pipe" });
  }
}

function fixMacPythonDylibs(venvRoot: string, pyVersion: string): void {
  const frameworkRef = frameworkPythonRef(pyVersion);
  const libName = libpythonFileName(pyVersion);
  const libPath = path.join(venvRoot, "lib", libName);
  const realPy = path.join(venvRoot, "lib", "Resources", "Python.app", "Contents", "MacOS", "Python");
  const binDir = path.join(venvRoot, "bin");

  if (!fs.existsSync(libPath) || !fs.existsSync(realPy)) {
    throw new Error("bundled Python runtime files are incomplete");
  }

  runInstallNameTool(["-id", `@loader_path/${libName}`, libPath]);
  changeFrameworkRef(libPath, frameworkRef, `@loader_path/${libName}`);
  changeFrameworkRef(realPy, frameworkRef, `@loader_path/../../../../${libName}`);

  if (fs.existsSync(binDir)) {
    for (const name of fs.readdirSync(binDir)) {
      const binPath = path.join(binDir, name);
      if (!fs.statSync(binPath).isFile() || !isMachO(binPath)) continue;
      changeFrameworkRef(binPath, frameworkRef, `@loader_path/../lib/${libName}`);
    }
  }

  for (const entry of fs.readdirSync(path.join(venvRoot, "lib"))) {
    if (!entry.endsWith(".dylib")) continue;
    changeFrameworkRef(path.join(venvRoot, "lib", entry), frameworkRef, `@loader_path/${entry}`);
  }

  const sitePackages = path.join(venvRoot, "lib", pyVersion, "site-packages");
  if (fs.existsSync(sitePackages)) {
    fixFrameworkRefsInTree(
      sitePackages,
      frameworkRef,
      `@loader_path/../../../../../../lib/${libName}`,
    );
  }
}

function copyRepairRuntime(repairRoot: string, venvRoot: string, pyVersion: string): void {
  const resourcesSrc = path.join(repairRoot, "Resources", "Python.app");
  const resourcesDest = path.join(venvRoot, "lib", "Resources", "Python.app");
  if (!fs.existsSync(resourcesSrc)) {
    throw new Error(`repair bundle missing Python.app at ${resourcesSrc}`);
  }
  fs.mkdirSync(path.join(venvRoot, "lib", "Resources"), { recursive: true });
  fs.rmSync(resourcesDest, { recursive: true, force: true });
  copyDirSync(resourcesSrc, resourcesDest);

  const libName = libpythonFileName(pyVersion);
  const libSrc = path.join(repairRoot, libName);
  if (!fs.existsSync(libSrc)) {
    throw new Error(`repair bundle missing ${libName}`);
  }
  fs.mkdirSync(path.join(venvRoot, "lib"), { recursive: true });
  fs.copyFileSync(libSrc, path.join(venvRoot, "lib", libName));
  fs.chmodSync(path.join(venvRoot, "lib", libName), 0o755);
}

function detectPythonLibVersionFromVenv(venvRoot: string): string | null {
  const libDir = path.join(venvRoot, "lib");
  if (!fs.existsSync(libDir)) return null;
  for (const entry of fs.readdirSync(libDir)) {
    if (/^python3\.\d+$/.test(entry)) return entry;
  }
  return null;
}

/** Ensure the extracted macOS venv does not depend on a system Python.framework install. */
export function ensureMacVenvPortable(venvRoot: string, repairRuntimeDir?: string | null): void {
  if (process.platform !== "darwin") return;

  const pyVersion = detectPythonLibVersionFromVenv(venvRoot);
  if (!pyVersion) {
    mainLog.warn("nanobot", "mac venv repair skipped: python lib version not found", { venvRoot });
    return;
  }

  const pythonAppPath = path.join(venvRoot, "lib", "Resources", "Python.app", "Contents", "MacOS", "Python");
  const libName = libpythonFileName(pyVersion);
  const libPath = path.join(venvRoot, "lib", libName);

  if ((!fs.existsSync(pythonAppPath) || !fs.existsSync(libPath)) && repairRuntimeDir) {
    mainLog.info("nanobot", "copying macOS python runtime repair bundle into venv", {
      repairRuntimeDir,
    });
    copyRepairRuntime(repairRuntimeDir, venvRoot, pyVersion);
  }

  if (!fs.existsSync(pythonAppPath) || !fs.existsSync(libPath)) {
    throw new Error("macOS python runtime is incomplete (missing Python.app or libpython)");
  }

  fixMacPythonDylibs(venvRoot, pyVersion);
  spawnSync("xattr", ["-cr", venvRoot], { stdio: "pipe" });
  signMachOFilesInTree(venvRoot);
  mainLog.info("nanobot", "macOS venv portability repair complete", { venvRoot, pyVersion });
}
