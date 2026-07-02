#!/usr/bin/env node
/**
 * Stage runtime externals (electron-log) for electron-builder — aligned with POC prepare-electron-native-deps.
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const repoRoot = process.cwd();
const shellRoot = path.join(repoRoot, "packages", "shell");
const packRoot = path.join(repoRoot, ".electron-pack");
const destRoot = path.join(packRoot, "node_modules");

rmSync(packRoot, { recursive: true, force: true });
mkdirSync(destRoot, { recursive: true });

const shellRequire = createRequire(path.join(shellRoot, "package.json"));
const packages = new Map();

function collectRuntimeDeps(packageName, resolvePaths) {
  if (packages.has(packageName)) {
    return;
  }
  let pkgJsonPath;
  try {
    pkgJsonPath = shellRequire.resolve(`${packageName}/package.json`, {
      paths: resolvePaths,
    });
  } catch {
    console.warn(`[electron-native-deps] skip unresolved dependency: ${packageName}`);
    return;
  }
  const pkgDir = path.dirname(pkgJsonPath);
  packages.set(packageName, pkgDir);
  const pkg = shellRequire(pkgJsonPath);
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    collectRuntimeDeps(dep, [pkgDir, shellRoot, repoRoot]);
  }
}

// Keep aligned with packages/shell/vite.main.config.ts rollupOptions.external
const PACKAGED_RUNTIME_DEPS = ["electron-log"];

for (const dep of PACKAGED_RUNTIME_DEPS) {
  try {
    collectRuntimeDeps(dep, [shellRoot, repoRoot]);
  } catch (e) {
    console.error(`[electron-native-deps] ${dep} not resolvable from packages/shell`);
    console.error(e);
    process.exit(1);
  }
}

for (const [name, src] of packages) {
  cpSync(src, path.join(destRoot, name), { recursive: true, dereference: true });
}

console.log(
  `[electron-native-deps] copied ${packages.size} packages: ${[...packages.keys()].sort().join(", ")} -> ${destRoot}`,
);
