#!/usr/bin/env node
/**
 * Clone nanobot webui from GitHub for reference/bundling.
 * The actual WebUI is served by `nanobot serve` — this script
 * optionally checks out the source for local customization.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const VENDOR_DIR = path.join(ROOT, "vendor", "nanobot-webui");
const REPO = process.env.BYCLAW_NANOBOT_REPO ?? "https://github.com/HKUDS/nanobot.git";
const BRANCH = process.env.BYCLAW_NANOBOT_BRANCH ?? "main";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${r.status}`);
  }
}

if (process.env.BYCLAW_PACK_SKIP_WEBUI_CLONE === "1") {
  console.log("[clone-nanobot-webui] skipped (BYCLAW_PACK_SKIP_WEBUI_CLONE=1)");
  process.exit(0);
}

if (fs.existsSync(path.join(VENDOR_DIR, ".git"))) {
  console.log("[clone-nanobot-webui] repo already exists, pulling latest...");
  run("git", ["pull", "--ff-only"], { cwd: VENDOR_DIR });
} else {
  console.log(`[clone-nanobot-webui] cloning ${REPO} (branch: ${BRANCH})...`);
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  run("git", [
    "clone",
    "--depth",
    "1",
    "--branch",
    BRANCH,
    REPO,
    VENDOR_DIR,
  ]);
}

console.log("[clone-nanobot-webui] OK");
