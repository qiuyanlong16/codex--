#!/usr/bin/env node
/**
 * Clone nanobot source repository to vendor/nanobot/.
 *
 * The full nanobot source (Python backend + React WebUI) is needed for:
 *   - Building the WebUI (vendor/nanobot/webui/ → packages/web/)
 *   - Creating the Python venv (vendor/nanobot/ is pip-installed into the venv)
 *   - Understanding the gateway protocol
 *
 * Env vars:
 *   BYCLAW_NANOBOT_REPO   — git repo URL (default: upstream GitHub)
 *   BYCLAW_NANOBOT_BRANCH — branch/tag to clone (default: main)
 *   BYCLAW_PACK_SKIP_CLONE — set to "1" to skip
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENDOR_DIR = path.join(ROOT, "vendor", "nanobot");

const REPO =
  process.env.BYCLAW_NANOBOT_REPO?.trim() || "https://github.com/HKUDS/nanobot.git";
const BRANCH = process.env.BYCLAW_NANOBOT_BRANCH?.trim() || "main";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} exited with code ${r.status}`);
  }
}

if (process.env.BYCLAW_PACK_SKIP_CLONE === "1") {
  console.log("[clone-nanobot] skipped (BYCLAW_PACK_SKIP_CLONE=1)");
  process.exit(0);
}

fs.mkdirSync(path.dirname(VENDOR_DIR), { recursive: true });

if (fs.existsSync(path.join(VENDOR_DIR, ".git"))) {
  console.log("[clone-nanobot] repo exists, pulling latest...");
  run("git", ["pull", "--ff-only"], { cwd: VENDOR_DIR });
} else {
  console.log(`[clone-nanobot] cloning ${REPO} (branch: ${BRANCH})...`);
  run("git", ["clone", "--depth", "1", "--branch", BRANCH, REPO, VENDOR_DIR]);
}

// Print version info for traceability
try {
  const head = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: VENDOR_DIR,
    encoding: "utf8",
  });
  if (head.status === 0) {
    console.log(`[clone-nanobot] HEAD: ${head.stdout.trim()}`);
  }
} catch {
  /* best-effort */
}

console.log(`[clone-nanobot] OK → ${VENDOR_DIR}`);
