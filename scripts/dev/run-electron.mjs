#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shellRoot = path.resolve(fileURLToPath(new URL("../../packages/shell", import.meta.url)));
const shellPkgPath = path.join(shellRoot, "package.json");
const shellRequire = createRequire(shellPkgPath);

/** Default npmmirror so first `require("electron")` does not hang on GitHub. */
function configureElectronDownloadMirror() {
  const pkg = JSON.parse(fs.readFileSync(shellPkgPath, "utf8"));
  const rawVersion = pkg.devDependencies?.electron ?? pkg.dependencies?.electron ?? "42.0.0";
  const version = String(rawVersion).replace(/^[~^]/, "");

  if (!process.env.ELECTRON_MIRROR) {
    process.env.ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/";
  }
  if (!process.env.ELECTRON_CUSTOM_DIR) {
    process.env.ELECTRON_CUSTOM_DIR = `v${version}`;
  }
}

configureElectronDownloadMirror();
const electronPath = shellRequire("electron");

const EXPECTED_MAIN = "dist/main/index.js";
const MIN_MAIN_BUNDLE_BYTES = 4_000;

function assertBundledMainReady() {
  const pkg = JSON.parse(fs.readFileSync(shellPkgPath, "utf8"));
  if (pkg.main !== EXPECTED_MAIN) {
    console.error(`[run-electron] Invalid main: ${pkg.main}`);
    process.exit(1);
  }
  const mainBundlePath = path.join(shellRoot, EXPECTED_MAIN);
  if (!fs.existsSync(mainBundlePath)) {
    console.error(`[run-electron] Missing ${mainBundlePath} — run pnpm dev:shell`);
    process.exit(1);
  }
  const { size } = fs.statSync(mainBundlePath);
  if (size < MIN_MAIN_BUNDLE_BYTES) {
    console.error(`[run-electron] Main bundle too small (${size} bytes)`);
    process.exit(1);
  }
}

assertBundledMainReady();

if (!process.env.BYCLAW_ENV?.trim()) {
  process.env.BYCLAW_ENV = "production";
}

const env = { ...process.env, NODE_ENV: "development" };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ["."], {
  cwd: shellRoot,
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
