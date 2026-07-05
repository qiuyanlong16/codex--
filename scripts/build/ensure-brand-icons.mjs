#!/usr/bin/env node
/**
 * Generate brand icons from source JPG when present; otherwise use placeholders.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWindowsTarget, resolveTargetPlatform } from "./lib/platform.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceJpg = join(ROOT, "resources/icons/source/codex--.jpg");
const iconPng = join(ROOT, "resources/icons/icon.png");
const iconIcns = join(ROOT, "resources/icons/icon.icns");
const iconIco = join(ROOT, "resources/icons/icon.ico");
const wizardSidebar = join(ROOT, "resources/installer/wizard-sidebar.bmp");

function runNode(script) {
  const r = spawnSync("node", [script], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function finish() {
  if (isWindowsTarget()) {
    runNode(join(ROOT, "scripts/build/gen-installer-images.mjs"));
  }
  console.log("[ensure-brand-icons] brand icons ready");
  process.exit(0);
}

function iconsReady() {
  if (!existsSync(iconPng)) return false;
  if (resolveTargetPlatform() === "darwin") {
    return existsSync(join(ROOT, "resources/icons/icon.icns"));
  }
  if (isWindowsTarget()) {
    return existsSync(iconIco) && existsSync(wizardSidebar);
  }
  return true;
}

if (existsSync(sourceJpg)) {
  console.log("[ensure-brand-icons] generating from source JPG");
  runNode(join(ROOT, "scripts/build/gen-brand-icons-from-source.mjs"));
  if (iconsReady()) {
    finish();
  }
}

if (iconsReady()) {
  console.log("[ensure-brand-icons] using existing brand icons");
  finish();
}

console.log(`[ensure-brand-icons] generating placeholders (target=${resolveTargetPlatform()})`);
runNode(join(ROOT, "scripts/build/gen-placeholder-icons.mjs"));
finish();
