import fs from "node:fs";
import path from "node:path";

export function resolveTargetPlatform() {
  return process.env.BYCLAW_TARGET_PLATFORM ?? process.platform;
}

export function resolveTargetArch() {
  if (process.env.BYCLAW_TARGET_ARCH) return process.env.BYCLAW_TARGET_ARCH;
  if (resolveTargetPlatform() === "darwin") return "arm64";
  return "x64";
}

export function isWindowsTarget() {
  return resolveTargetPlatform() === "win32";
}

export function findSitePackagesDir(venvRoot) {
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

export function sitePackagesTarPrefix(venvRoot) {
  const sitePackages = findSitePackagesDir(venvRoot);
  if (!sitePackages) {
    return isWindowsTarget()
      ? "python-venv/Lib/site-packages"
      : "python-venv/lib/python3/site-packages";
  }
  return `python-venv/${path.relative(venvRoot, sitePackages).split(path.sep).join("/")}`;
}

export function resolveTarExe(spawnSync) {
  const win = isWindowsTarget() || process.platform === "win32";
  const candidates = win
    ? [path.join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe"), "tar"]
    : ["/usr/bin/tar", "/bin/tar", "tar"];
  for (const c of candidates) {
    const probe = spawnSync(c, ["--version"], {
      encoding: "utf8",
      windowsHide: process.platform === "win32",
    });
    if (probe.status === 0) return c;
  }
  return null;
}

export function fixPortablePyvenvCfg(venvDir) {
  const cfgPath = path.join(venvDir, "pyvenv.cfg");
  if (!fs.existsSync(cfgPath)) return;
  const pythonExe = isWindowsTarget()
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python3");
  let content = fs.readFileSync(cfgPath, "utf8");
  content = content.replace(/^home\s*=.*$/m, `home = ${path.dirname(pythonExe)}`);
  content = content.replace(/^executable\s*=.*$/m, `executable = ${pythonExe}`);
  fs.writeFileSync(cfgPath, content);
  console.log("[pack-venv] fixed pyvenv.cfg for portability");
}
