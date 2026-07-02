#!/usr/bin/env node
/**
 * Copy NSIS installer scripts for nanobot bundle unpack + Python install.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const scriptsSrc = join(ROOT, "resources/installer/scripts");
const scriptsDest = join(ROOT, "packages/shell/resources/installer-scripts");

const scriptFiles = ["unpack-nanobot.cjs", "install-python.cjs"];

mkdirSync(scriptsDest, { recursive: true });
for (const file of scriptFiles) {
  copyFileSync(join(scriptsSrc, file), join(scriptsDest, file));
}

console.log("[bundle-installer-scripts] OK →", scriptsDest);
