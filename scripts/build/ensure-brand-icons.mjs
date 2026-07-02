#!/usr/bin/env node
/**
 * Use POC brand icons when present; otherwise generate placeholders.
 * (Python gen-brand-icons.py was removed — no Python dependency.)
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const iconIco = join(ROOT, "resources/icons/icon.ico");
const wizardSidebar = join(ROOT, "resources/installer/wizard-sidebar.bmp");

function runNode(script) {
  const r = spawnSync("node", [script], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (existsSync(iconIco) && existsSync(wizardSidebar)) {
  console.log("[ensure-brand-icons] using existing brand icons");
  process.exit(0);
}

console.log("[ensure-brand-icons] no brand icons found — generating placeholders");
runNode(join(ROOT, "scripts/build/gen-placeholder-icons.mjs"));
runNode(join(ROOT, "scripts/build/gen-installer-images.mjs"));
