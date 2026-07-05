#!/usr/bin/env node
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** Windows needs shell mode for pnpm/npx; use command strings only (no args + shell). */
function runShell(command) {
  const result = spawnSync(command, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveConcurrentlyBin() {
  const binName = process.platform === "win32" ? "concurrently.cmd" : "concurrently";
  const pnpmBin = path.join(repoRoot, "node_modules", ".bin", binName);
  try {
    const req = createRequire(path.join(repoRoot, "package.json"));
    const pkgJson = req.resolve("concurrently/package.json");
    return path.join(path.dirname(pkgJson), "dist", "bin", "concurrently.js");
  } catch {
    return pnpmBin;
  }
}

runShell("node scripts/dev/free-vite-port.mjs");
runShell("pnpm build:shared");

const concurrentlyBin = resolveConcurrentlyBin();
const concurrentlyCmd =
  process.platform === "win32" && concurrentlyBin.endsWith(".cmd")
    ? `"${concurrentlyBin}"`
    : `node "${concurrentlyBin}"`;
const child = spawn(
  `${concurrentlyCmd} -n web,shell,electron "pnpm dev:web" "pnpm dev:shell" "pnpm dev:electron"`,
  {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: true,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
