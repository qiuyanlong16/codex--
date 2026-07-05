import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FRAMEWORK_PREFIX = "/Library/Frameworks/Python.framework/Versions/";

export function pythonMinorFromLibVersion(pyVersion) {
  const match = pyVersion.match(/^python(\d+\.\d+)$/);
  return match?.[1] ?? null;
}

export function frameworkPythonRef(pyVersion) {
  const minor = pythonMinorFromLibVersion(pyVersion);
  if (!minor) throw new Error(`invalid python lib version: ${pyVersion}`);
  return `${FRAMEWORK_PREFIX}${minor}/Python`;
}

export function libpythonFileName(pyVersion) {
  return `lib${pyVersion}.dylib`;
}

function isMachO(filePath) {
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

function runInstallNameTool(args) {
  const result = spawnSync("install_name_tool", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`install_name_tool ${args.join(" ")} failed: ${detail}`);
  }
}

function changeFrameworkRef(filePath, frameworkRef, newRef) {
  const probe = spawnSync("otool", ["-L", filePath], { encoding: "utf8" });
  if (probe.status !== 0) return;
  if (!probe.stdout.includes(frameworkRef)) return;
  runInstallNameTool(["-change", frameworkRef, newRef, filePath]);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

export function resolveMacPythonBasePrefix(pyvenvCfgPath) {
  const cfgContent = fs.readFileSync(pyvenvCfgPath, "utf8");
  const homeMatch = cfgContent.match(/^home\s*=\s*(.+)$/m);
  const commandMatch = cfgContent.match(/^command\s*=\s*(.+)$/m);
  const home = homeMatch?.[1]?.trim();
  if (home) {
    const basePrefix = path.dirname(home);
    if (fs.existsSync(path.join(basePrefix, "Resources", "Python.app"))) {
      return basePrefix;
    }
  }
  const command = commandMatch?.[1]?.trim() ?? "";
  const frameworkMatch = command.match(
    /(\/Library\/Frameworks\/Python\.framework\/Versions\/[^/\s]+)/,
  );
  if (frameworkMatch?.[1] && fs.existsSync(path.join(frameworkMatch[1], "Resources", "Python.app"))) {
    return frameworkMatch[1];
  }
  throw new Error("could not resolve macOS Python.framework base prefix from pyvenv.cfg");
}

export function copyPythonAppResources(basePrefix, venvRoot) {
  const src = path.join(basePrefix, "Resources", "Python.app");
  const dest = path.join(venvRoot, "lib", "Resources", "Python.app");
  if (!fs.existsSync(src)) {
    throw new Error(`Python.app not found at ${src}`);
  }
  fs.mkdirSync(path.join(venvRoot, "lib", "Resources"), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  copyDirSync(src, dest);
  console.log(`[macos-venv] copied Python.app → ${dest}`);
}

export function copyLibpythonDylib(basePrefix, venvRoot, pyVersion) {
  const libName = libpythonFileName(pyVersion);
  const src = path.join(basePrefix, "lib", libName);
  const dest = path.join(venvRoot, "lib", libName);
  if (!fs.existsSync(src)) {
    throw new Error(`libpython not found at ${src}`);
  }
  fs.mkdirSync(path.join(venvRoot, "lib"), { recursive: true });
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`[macos-venv] copied ${libName} → ${dest}`);
}

export function fixMacPythonDylibs(venvRoot, pyVersion) {
  const frameworkRef = frameworkPythonRef(pyVersion);
  const libName = libpythonFileName(pyVersion);
  const libPath = path.join(venvRoot, "lib", libName);
  const realPy = path.join(venvRoot, "lib", "Resources", "Python.app", "Contents", "MacOS", "Python");
  const binDir = path.join(venvRoot, "bin");

  if (!fs.existsSync(libPath)) {
    throw new Error(`missing bundled libpython: ${libPath}`);
  }
  if (!fs.existsSync(realPy)) {
    throw new Error(`missing bundled Python.app executable: ${realPy}`);
  }

  runInstallNameTool(["-id", `@loader_path/${libName}`, libPath]);
  changeFrameworkRef(libPath, frameworkRef, `@loader_path/${libName}`);

  changeFrameworkRef(realPy, frameworkRef, `@loader_path/../../../../${libName}`);

  for (const name of fs.readdirSync(binDir)) {
    const binPath = path.join(binDir, name);
    if (!fs.statSync(binPath).isFile() || !isMachO(binPath)) continue;
    changeFrameworkRef(binPath, frameworkRef, `@loader_path/../lib/${libName}`);
  }

  for (const entry of fs.readdirSync(path.join(venvRoot, "lib"))) {
    if (!entry.endsWith(".dylib")) continue;
    const dylibPath = path.join(venvRoot, "lib", entry);
    changeFrameworkRef(dylibPath, frameworkRef, `@loader_path/${entry}`);
  }

  const sitePackages = path.join(venvRoot, "lib", pyVersion, "site-packages");
  if (fs.existsSync(sitePackages)) {
    fixFrameworkRefsInTree(sitePackages, frameworkRef, `@loader_path/../../../../../../lib/${libName}`);
  }

  console.log("[macos-venv] rewrote Python.framework dylib references");
}

function fixFrameworkRefsInTree(dir, frameworkRef, newRef) {
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

export function adHocSignMacVenv(venvRoot) {
  spawnSync("xattr", ["-cr", venvRoot], { stdio: "pipe" });
  signMachOFilesInTree(venvRoot);
}

function signMachOFilesInTree(dir) {
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

export function venvStillReferencesSystemFramework(venvRoot, pyVersion) {
  const frameworkRef = frameworkPythonRef(pyVersion);
  const pythonExe = path.join(venvRoot, "bin", "python3");
  if (!fs.existsSync(pythonExe)) return true;
  const probe = spawnSync("otool", ["-L", pythonExe], { encoding: "utf8" });
  return probe.stdout.includes(frameworkRef);
}

export function makeMacVenvPortable(venvRoot, pyVersion, basePrefix) {
  copyPythonAppResources(basePrefix, venvRoot);
  copyLibpythonDylib(basePrefix, venvRoot, pyVersion);
  fixMacPythonDylibs(venvRoot, pyVersion);
  adHocSignMacVenv(venvRoot);
}

export function stageDarwinPythonRuntime(venvRoot, destDir) {
  const runtimeRoot = path.join(destDir, "python-darwin-runtime");
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const resourcesSrc = path.join(venvRoot, "lib", "Resources");
  const resourcesDest = path.join(runtimeRoot, "Resources");
  fs.rmSync(resourcesDest, { recursive: true, force: true });
  copyDirSync(resourcesSrc, resourcesDest);

  for (const entry of fs.readdirSync(path.join(venvRoot, "lib"))) {
    if (!entry.startsWith("libpython") || !entry.endsWith(".dylib")) continue;
    fs.copyFileSync(path.join(venvRoot, "lib", entry), path.join(runtimeRoot, entry));
  }

  const pyVersion = fs
    .readdirSync(path.join(venvRoot, "lib"))
    .find((entry) => /^python3\.\d+$/.test(entry));
  fs.writeFileSync(
    path.join(runtimeRoot, "manifest.json"),
    JSON.stringify({ pyVersion, createdAt: new Date().toISOString() }, null, 2),
  );
  console.log(`[macos-venv] staged darwin runtime repair bundle → ${runtimeRoot}`);
}
