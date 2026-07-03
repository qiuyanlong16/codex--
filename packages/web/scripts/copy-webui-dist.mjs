#!/usr/bin/env node
/**
 * Post-build: copy packages/web/dist/ to vendor/nanobot/nanobot/web/dist/
 * so the nanobot gateway (editable install) serves the latest webui build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = path.join(ROOT, "packages", "web", "dist");
const DEST = path.join(ROOT, "vendor", "nanobot", "nanobot", "web", "dist");

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(SRC)) {
  console.error("[copy-webui-dist] ERROR: " + SRC + " not found. Run vite build first.");
  process.exit(1);
}

rmrf(DEST);
copyDir(SRC, DEST);
console.log("[copy-webui-dist] OK: " + SRC + " -> " + DEST);
