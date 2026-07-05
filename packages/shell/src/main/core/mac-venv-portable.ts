import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mainLog } from "./logging/main-logger.js";

const FRAMEWORK_ROOT = "/Library/Frameworks/Python.framework/Versions/";

function pythonMinorFromLibVersion(pyVersion: string): string | null {
  const match = pyVersion.match(/^python(\d+\.\d+)$/);
  return match?.[1] ?? null;
}

function frameworkPythonRef(pyVersion: string): string {
  const minor = pythonMinorFromLibVersion(pyVersion);
  if (!minor) throw new Error(`invalid python lib version: ${pyVersion}`);
  return `${FRAMEWORK_ROOT}${minor}/Python`;
}

function frameworkLibPrefix(pyVersion: string): string {
  const minor = pythonMinorFromLibVersion(pyVersion);
  if (!minor) throw new Error(`invalid python lib version: ${pyVersion}`);
  return `${FRAMEWORK_ROOT}${minor}/lib/`;
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

function loaderPathRef(fromFile: string, toFile: string): string {
  let rel = path.relative(path.dirname(fromFile), toFile);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `@loader_path/${rel.split(path.sep).join("/")}`;
}

function listLoadedLibraries(filePath: string): string[] {
  const probe = spawnSync("otool", ["-L", filePath], { encoding: "utf8" });
  if (probe.status !== 0) return [];
  const refs: string[] = [];
  for (const line of probe.stdout.split("\n").slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ref = trimmed.split(" (")[0]?.trim();
    if (ref) refs.push(ref);
  }
  return refs;
}

function changeLoadedLibrary(filePath: string, oldRef: string, newRef: string): void {
  if (oldRef === newRef) return;
  if (!listLoadedLibraries(filePath).includes(oldRef)) return;
  runInstallNameTool(["-change", oldRef, newRef, filePath]);
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

function walkMachOFiles(dir: string, visitor: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkMachOFiles(full, visitor);
      continue;
    }
    if (!isMachO(full)) continue;
    visitor(full);
  }
}

function resolveBundledTarget(venvRoot: string, pyVersion: string, ref: string): string | null {
  const libDir = path.join(venvRoot, "lib");
  if (ref === frameworkPythonRef(pyVersion)) {
    return path.join(libDir, libpythonFileName(pyVersion));
  }
  const libPrefix = frameworkLibPrefix(pyVersion);
  if (ref.startsWith(libPrefix)) {
    return path.join(libDir, path.basename(ref));
  }
  return null;
}

function fixMacPythonDylibs(venvRoot: string, pyVersion: string): void {
  const libName = libpythonFileName(pyVersion);
  const libPath = path.join(venvRoot, "lib", libName);
  const realPy = path.join(venvRoot, "lib", "Resources", "Python.app", "Contents", "MacOS", "Python");

  if (!fs.existsSync(libPath) || !fs.existsSync(realPy)) {
    throw new Error("bundled Python runtime files are incomplete");
  }

  runInstallNameTool(["-id", `@loader_path/${libName}`, libPath]);

  walkMachOFiles(venvRoot, (filePath) => {
    for (const ref of listLoadedLibraries(filePath)) {
      const target = resolveBundledTarget(venvRoot, pyVersion, ref);
      if (!target || !fs.existsSync(target)) continue;
      changeLoadedLibrary(filePath, ref, loaderPathRef(filePath, target));
    }
  });
}

function copyRepairRuntime(repairRoot: string, venvRoot: string): void {
  const resourcesSrc = path.join(repairRoot, "Resources", "Python.app");
  const resourcesDest = path.join(venvRoot, "lib", "Resources", "Python.app");
  if (!fs.existsSync(resourcesSrc)) {
    throw new Error(`repair bundle missing Python.app at ${resourcesSrc}`);
  }
  fs.mkdirSync(path.join(venvRoot, "lib", "Resources"), { recursive: true });
  fs.rmSync(resourcesDest, { recursive: true, force: true });
  copyDirSync(resourcesSrc, resourcesDest);

  const destLibDir = path.join(venvRoot, "lib");
  fs.mkdirSync(destLibDir, { recursive: true });
  for (const entry of fs.readdirSync(repairRoot)) {
    if (!entry.endsWith(".dylib")) continue;
    fs.copyFileSync(path.join(repairRoot, entry), path.join(destLibDir, entry));
    fs.chmodSync(path.join(destLibDir, entry), 0o755);
  }
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
  const libPath = path.join(venvRoot, "lib", libpythonFileName(pyVersion));

  if ((!fs.existsSync(pythonAppPath) || !fs.existsSync(libPath)) && repairRuntimeDir) {
    mainLog.info("nanobot", "copying macOS python runtime repair bundle into venv", {
      repairRuntimeDir,
    });
    copyRepairRuntime(repairRuntimeDir, venvRoot);
  }

  if (!fs.existsSync(pythonAppPath) || !fs.existsSync(libPath)) {
    throw new Error("macOS python runtime is incomplete (missing Python.app or libpython)");
  }

  fixMacPythonDylibs(venvRoot, pyVersion);
  spawnSync("xattr", ["-cr", venvRoot], { stdio: "pipe" });
  signEssentialMacBinaries(venvRoot, pyVersion);
  mainLog.info("nanobot", "macOS venv portability repair complete", { venvRoot, pyVersion });
}

function signEssentialMacBinaries(venvRoot: string, pyVersion: string): void {
  const essentials = [
    path.join(venvRoot, "bin", "python3"),
    path.join(venvRoot, "bin", pyVersion),
    path.join(venvRoot, "bin", "python"),
    path.join(venvRoot, "lib", "Resources", "Python.app", "Contents", "MacOS", "Python"),
  ];
  for (const entry of fs.readdirSync(path.join(venvRoot, "lib"))) {
    if (entry.endsWith(".dylib")) essentials.push(path.join(venvRoot, "lib", entry));
  }
  const dynload = path.join(venvRoot, "lib", pyVersion, "lib-dynload");
  if (fs.existsSync(dynload)) {
    for (const entry of fs.readdirSync(dynload)) {
      if (entry.endsWith(".so")) essentials.push(path.join(dynload, entry));
    }
  }
  for (const filePath of essentials) {
    if (!fs.existsSync(filePath) || !isMachO(filePath)) continue;
    fs.chmodSync(filePath, fs.statSync(filePath).mode | 0o755);
    spawnSync("codesign", ["-s", "-", "-f", filePath], { stdio: "pipe" });
  }
}
