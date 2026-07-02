#!/usr/bin/env node
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

runShell("node scripts/dev/free-vite-port.mjs");
runShell("pnpm build:shared");

const child = spawn(
  'npx concurrently -n web,shell,electron "pnpm dev:web" "pnpm dev:shell" "pnpm dev:electron"',
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
