#!/usr/bin/env node
/**
 * Sync nanobot WebUI source from vendor/nanobot/webui/ into packages/web/.
 *
 * The nanobot WebUI is a React+TypeScript SPA (TailwindCSS, shadcn/ui).
 * This script replaces the placeholder Vue app in packages/web/ with the
 * real React webui, ready for `vite build`.
 *
 * Steps:
 *   1. Remove Vue-specific files from packages/web/src/
 *   2. Copy React source tree from vendor/nanobot/webui/src/
 *   3. Copy public/ assets (brand icons, etc.)
 *   4. Copy config files (vite, tsconfig, tailwind, postcss, etc.)
 *   5. Rewrite packages/web/package.json with React deps
 *   6. Patch index.html and vite.config.ts for file:// / Electron context
 *
 * Prerequisites:
 *   Run `pnpm pack:clone-nanobot` first (or set BYCLAW_NANOBOT_VENDOR_DIR).
 *
 * Env vars:
 *   BYCLAW_NANOBOT_VENDOR_DIR — override vendor/nanobot path
 *   BYCLAW_PACK_SKIP_WEBUI_SYNC — "1" to skip
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENDOR_WEBUI =
  process.env.BYCLAW_NANOBOT_VENDOR_DIR?.trim() ||
  path.join(ROOT, "vendor", "nanobot", "webui");
const WEB_PKG = path.join(ROOT, "packages", "web");
const WEB_SRC = path.join(WEB_PKG, "src");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// ---------------------------------------------------------------------------
// Skip gate
// ---------------------------------------------------------------------------

if (process.env.BYCLAW_PACK_SKIP_WEBUI_SYNC === "1") {
  console.log("[sync-webui] skipped (BYCLAW_PACK_SKIP_WEBUI_SYNC=1)");
  process.exit(0);
}

if (!fs.existsSync(VENDOR_WEBUI)) {
  console.error(
    `[sync-webui] ERROR: vendor webui not found at ${VENDOR_WEBUI}\n` +
      `Run \`pnpm pack:clone-nanobot\` first.`,
  );
  process.exit(1);
}

console.log(`[sync-webui] source: ${VENDOR_WEBUI}`);
console.log(`[sync-webui] target: ${WEB_PKG}`);

// ---------------------------------------------------------------------------
// 1. Remove Vue-specific files from packages/web/
// ---------------------------------------------------------------------------

const VUE_FILES_TO_REMOVE = [
  path.join(WEB_SRC, "App.vue"),
  path.join(WEB_SRC, "main.ts"),
  path.join(WEB_SRC, "router.ts"),
  path.join(WEB_SRC, "styles.css"),
  path.join(WEB_SRC, "env.d.ts"),
  path.join(WEB_SRC, "shims-vue.d.ts"),
  path.join(WEB_SRC, "views"),
];

for (const p of VUE_FILES_TO_REMOVE) {
  if (fs.existsSync(p)) {
    rmrf(p);
    console.log(`[sync-webui]   removed ${path.relative(ROOT, p)}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Copy React source tree from vendor/nanobot/webui/src/
// ---------------------------------------------------------------------------

// Clear existing src/ contents (in case of stale files from previous sync)
rmrf(WEB_SRC);
copyDir(path.join(VENDOR_WEBUI, "src"), WEB_SRC);
console.log("[sync-webui]   copied src/");

// ---------------------------------------------------------------------------
// 3. Copy public/ assets
// ---------------------------------------------------------------------------

const vendorPublic = path.join(VENDOR_WEBUI, "public");
if (fs.existsSync(vendorPublic)) {
  rmrf(path.join(WEB_PKG, "public"));
  copyDir(vendorPublic, path.join(WEB_PKG, "public"));
  console.log("[sync-webui]   copied public/");
}

// ---------------------------------------------------------------------------
// 4. Copy config files
// ---------------------------------------------------------------------------

const CONFIG_FILES = [
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.build.json",
  "postcss.config.js",
  "tailwind.config.js",
  "components.json",
  "eslint.config.js",
  ".gitignore",
];

for (const name of CONFIG_FILES) {
  const src = path.join(VENDOR_WEBUI, name);
  if (fs.existsSync(src)) {
    copyFile(src, path.join(WEB_PKG, name));
  }
}
console.log("[sync-webui]   copied config files");

// ---------------------------------------------------------------------------
// 5. Copy index.html (with patching for Electron / file:// context)
// ---------------------------------------------------------------------------

let indexHtml = fs.readFileSync(path.join(VENDOR_WEBUI, "index.html"), "utf8");

// Convert absolute asset paths to relative (needed for file:// loading)
indexHtml = indexHtml.replace(
  /href="\/brand\//g,
  'href="./brand/',
);
indexHtml = indexHtml.replace(
  /src="\/brand\//g,
  'src="./brand/',
);

fs.writeFileSync(path.join(WEB_PKG, "index.html"), indexHtml);
console.log("[sync-webui]   wrote index.html (relative paths)");

// ---------------------------------------------------------------------------
// 6. Patch vite.config.ts — output to local dist/, use relative base
// ---------------------------------------------------------------------------

const viteConfig = fs.readFileSync(path.join(WEB_PKG, "vite.config.ts"), "utf8");

let patched = viteConfig;

// Change outDir from ../nanobot/web/dist to local dist/
patched = patched.replace(
  /outDir:\s*path\.resolve\(__dirname,\s*"\.\.\/nanobot\/web\/dist"\)/,
  'outDir: path.resolve(__dirname, "dist")',
);

// Ensure base is "./" for file:// compatibility (add if not present)
if (!patched.includes('base:')) {
  patched = patched.replace(
    /return\s*\{/,
    'return {\n    base: "./",',
  );
}

fs.writeFileSync(path.join(WEB_PKG, "vite.config.ts"), patched);
console.log("[sync-webui]   patched vite.config.ts");

// ---------------------------------------------------------------------------
// 7. Rewrite packages/web/package.json with React deps
// ---------------------------------------------------------------------------

// Read vendor webui package.json for deps
const vendorPkg = JSON.parse(
  fs.readFileSync(path.join(VENDOR_WEBUI, "package.json"), "utf8"),
);

const webPkg = {
  name: "@byclaw-nanobot/web",
  version: "0.1.0",
  private: true,
  type: "module",
  scripts: {
    dev: "vite",
    build: "tsc -p tsconfig.build.json && vite build && node scripts/copy-webui-dist.mjs",
    preview: "vite preview",
    test: "vitest run",
    "test:watch": "vitest",
    lint: "eslint src --max-warnings 0",
  },
  dependencies: {
    "@byclaw-nanobot/shared": "workspace:*",
    ...vendorPkg.dependencies,
  },
  devDependencies: {
    ...vendorPkg.devDependencies,
    "@types/mdast": "^4.0.4",
    "micromark-util-types": "^2.0.2",
    "unified": "^11.0.5",
    "micromark-extension-math": "^3.1.0",
  },
};

fs.writeFileSync(
  path.join(WEB_PKG, "package.json"),
  JSON.stringify(webPkg, null, 2) + "\n",
);
console.log("[sync-webui]   wrote package.json (React deps)");

// ---------------------------------------------------------------------------
// 8. Write the post-build copy script
// ---------------------------------------------------------------------------

// After `vite build`, this script copies packages/web/dist/ to:
//   - vendor/nanobot/nanobot/web/dist/ (so the editable-install gateway finds it)
// This runs as part of `pnpm build:web`.

const webPkgScriptsDir = path.join(WEB_PKG, "scripts");
fs.mkdirSync(webPkgScriptsDir, { recursive: true });

const copyScript = `#!/usr/bin/env node
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
`;

fs.writeFileSync(path.join(webPkgScriptsDir, "copy-webui-dist.mjs"), copyScript);
console.log("[sync-webui]   wrote packages/web/scripts/copy-webui-dist.mjs");

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log("[sync-webui] OK");
console.log("");
console.log("Next steps:");
console.log("  pnpm install       # install React + TailwindCSS deps");
console.log("  pnpm build:web     # build webui to packages/web/dist/");
