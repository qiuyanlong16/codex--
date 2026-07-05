import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FRAMEWORK_ROOT = "/Library/Frameworks/Python.framework/Versions/";

export function pythonMinorFromLibVersion(pyVersion) {
  const match = pyVersion.match(/^python(\d+\.\d+)$/);
  return match?.[1] ?? null;
}

export function frameworkPythonRef(pyVersion) {
  const minor = pythonMinorFromLibVersion(pyVersion);
  if (!minor) throw new Error(`invalid python lib version: ${pyVersion}`);
  return `${FRAMEWORK_ROOT}${minor}/Python`;
}

export function frameworkLibPrefix(pyVersion) {
  const minor = pythonMinorFromLibVersion(pyVersion);
  if (!minor) throw new Error(`invalid python lib version: ${pyVersion}`);
  return `${FRAMEWORK_ROOT}${minor}/lib/`;
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

function loaderPathRef(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile);
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return `@loader_path/${rel.split(path.sep).join("/")}`;
}

function listLoadedLibraries(filePath) {
  const probe = spawnSync("otool", ["-L", filePath], { encoding: "utf8" });
  if (probe.status !== 0) return [];
  const refs = [];
  for (const line of probe.stdout.split("\n").slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const ref = trimmed.split(" (")[0]?.trim();
    if (ref) refs.push(ref);
  }
  return refs;
}

function changeLoadedLibrary(filePath, oldRef, newRef) {
  if (oldRef === newRef) return;
  const loaded = listLoadedLibraries(filePath);
  if (!loaded.includes(oldRef)) return;
  runInstallNameTool(["-change", oldRef, newRef, filePath]);
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

export function copyFrameworkLibs(basePrefix, venvRoot) {
  const srcLibDir = path.join(basePrefix, "lib");
  const destLibDir = path.join(venvRoot, "lib");
  if (!fs.existsSync(srcLibDir)) {
    throw new Error(`framework lib dir not found at ${srcLibDir}`);
  }
  fs.mkdirSync(destLibDir, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(srcLibDir)) {
    if (!entry.endsWith(".dylib")) continue;
    fs.copyFileSync(path.join(srcLibDir, entry), path.join(destLibDir, entry));
    fs.chmodSync(path.join(destLibDir, entry), 0o755);
    copied++;
  }
  const frameworkPython = path.join(basePrefix, "Python");
  const libpythonName = fs
    .readdirSync(destLibDir)
    .find((entry) => entry.startsWith("libpython") && entry.endsWith(".dylib"));
  if (libpythonName && fs.existsSync(frameworkPython)) {
    fs.copyFileSync(frameworkPython, path.join(destLibDir, libpythonName));
    fs.chmodSync(path.join(destLibDir, libpythonName), 0o755);
  }
  console.log(`[macos-venv] copied ${copied} framework dylib(s) into lib/`);
}

export function copyLibpythonDylib(basePrefix, venvRoot, pyVersion) {
  copyFrameworkLibs(basePrefix, venvRoot);
  const libName = libpythonFileName(pyVersion);
  const dest = path.join(venvRoot, "lib", libName);
  if (!fs.existsSync(dest)) {
    throw new Error(`libpython not found at ${dest}`);
  }
}

function resolveBundledTarget(venvRoot, pyVersion, ref) {
  const libDir = path.join(venvRoot, "lib");
  const pythonRef = frameworkPythonRef(pyVersion);
  const libPrefix = frameworkLibPrefix(pyVersion);
  if (ref === pythonRef) {
    return path.join(libDir, libpythonFileName(pyVersion));
  }
  if (ref.startsWith(libPrefix)) {
    return path.join(libDir, path.basename(ref));
  }
  return null;
}

function walkMachOFiles(dir, visitor) {
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

export function fixMacPythonDylibs(venvRoot, pyVersion) {
  const libDir = path.join(venvRoot, "lib");
  const libName = libpythonFileName(pyVersion);
  const libPath = path.join(libDir, libName);
  const realPy = path.join(libDir, "Resources", "Python.app", "Contents", "MacOS", "Python");

  if (!fs.existsSync(libPath)) {
    throw new Error(`missing bundled libpython: ${libPath}`);
  }
  if (!fs.existsSync(realPy)) {
    throw new Error(`missing bundled Python.app executable: ${realPy}`);
  }

  runInstallNameTool(["-id", `@loader_path/${libName}`, libPath]);

  walkMachOFiles(venvRoot, (filePath) => {
    for (const ref of listLoadedLibraries(filePath)) {
      const target = resolveBundledTarget(venvRoot, pyVersion, ref);
      if (!target || !fs.existsSync(target)) continue;
      changeLoadedLibrary(filePath, ref, loaderPathRef(filePath, target));
    }
  });

  console.log("[macos-venv] rewrote Python.framework dylib references");
}

export function adHocSignMacVenv(venvRoot) {
  spawnSync("xattr", ["-cr", venvRoot], { stdio: "pipe" });
  signMachOFilesInTree(venvRoot);
}

/** Faster signing for runtime repair — only the interpreter and native modules. */
export function adHocSignMacVenvEssentials(venvRoot, pyVersion) {
  spawnSync("xattr", ["-cr", venvRoot], { stdio: "pipe" });
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
  const pythonExe = path.join(venvRoot, "bin", "python3");
  if (!fs.existsSync(pythonExe)) return true;
  const libPrefix = frameworkLibPrefix(pyVersion);
  const pythonRef = frameworkPythonRef(pyVersion);
  let hasSystemRef = false;
  walkMachOFiles(venvRoot, (filePath) => {
    for (const ref of listLoadedLibraries(filePath)) {
      if (ref === pythonRef || ref.startsWith(libPrefix)) {
        hasSystemRef = true;
      }
    }
  });
  return hasSystemRef;
}

export function makeMacVenvPortable(venvRoot, pyVersion, basePrefix) {
  copyPythonAppResources(basePrefix, venvRoot);
  copyLibpythonDylib(basePrefix, venvRoot, pyVersion);
  fixMacPythonDylibs(venvRoot, pyVersion);
  adHocSignMacVenv(venvRoot);
}

export function repairMacVenvFromRuntimeBundle(venvRoot, runtimeRoot, pyVersion) {
  const resourcesSrc = path.join(runtimeRoot, "Resources", "Python.app");
  const resourcesDest = path.join(venvRoot, "lib", "Resources", "Python.app");
  if (!fs.existsSync(resourcesSrc)) {
    throw new Error(`repair bundle missing Python.app at ${resourcesSrc}`);
  }
  fs.mkdirSync(path.join(venvRoot, "lib", "Resources"), { recursive: true });
  fs.rmSync(resourcesDest, { recursive: true, force: true });
  copyDirSync(resourcesSrc, resourcesDest);

  const destLibDir = path.join(venvRoot, "lib");
  fs.mkdirSync(destLibDir, { recursive: true });
  for (const entry of fs.readdirSync(runtimeRoot)) {
    if (!entry.endsWith(".dylib")) continue;
    fs.copyFileSync(path.join(runtimeRoot, entry), path.join(destLibDir, entry));
    fs.chmodSync(path.join(destLibDir, entry), 0o755);
  }

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
    if (!entry.endsWith(".dylib")) continue;
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
