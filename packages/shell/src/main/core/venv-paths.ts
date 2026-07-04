import fs from "node:fs";
import path from "node:path";

export function venvScriptsDir(venvRoot: string): string {
  return process.platform === "win32"
    ? path.join(venvRoot, "Scripts")
    : path.join(venvRoot, "bin");
}

export function venvPythonPath(venvRoot: string): string {
  if (process.platform === "win32") {
    return path.join(venvRoot, "Scripts", "python.exe");
  }
  const binDir = path.join(venvRoot, "bin");
  for (const name of ["python3", "python"]) {
    const candidate = path.join(binDir, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(binDir, "python3");
}

export function findSitePackagesDir(venvRoot: string): string | null {
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

export function resolveSystemTarCandidates(): string[] {
  if (process.platform === "win32") {
    return [
      path.join(process.env.WINDIR || "C:\\Windows", "System32", "tar.exe"),
      "tar.exe",
      "tar",
    ];
  }
  return ["/usr/bin/tar", "/bin/tar", "tar"];
}
