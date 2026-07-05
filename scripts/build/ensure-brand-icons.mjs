#!/usr/bin/env node
/**
 * Use POC brand icons when present; otherwise generate placeholders.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWindowsTarget, resolveTargetPlatform } from "./lib/platform.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const iconPng = join(ROOT, "resources/icons/icon.png");
const iconIco = join(ROOT, "resources/icons/icon.ico");
const wizardSidebar = join(ROOT, "resources/installer/wizard-sidebar.bmp");

function runNode(script) {
  const r = spawnSync("node", [script], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function iconsReady() {
  if (!existsSync(iconPng)) return false;
  if (resolveTargetPlatform() === "darwin") return true;
  if (isWindowsTarget()) {
    return existsSync(iconIco) && existsSync(wizardSidebar);
  }
  return true;
}

if (iconsReady()) {
  console.log("[ensure-brand-icons] using existing brand icons");
  process.exit(0);
}

console.log(`[ensure-brand-icons] generating placeholders (target=${resolveTargetPlatform()})`);
runNode(join(ROOT, "scripts/build/gen-placeholder-icons.mjs"));
if (isWindowsTarget()) {
  runNode(join(ROOT, "scripts/build/gen-installer-images.mjs"));
}
