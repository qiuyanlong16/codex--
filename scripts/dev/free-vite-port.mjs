#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const PORT = 5173;
const isWin = process.platform === "win32";

function killPortWindows() {
  const found = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  if (found.status !== 0) return;
  const lines = found.stdout.split("\n");
  for (const line of lines) {
    if (!line.includes(`:${PORT}`)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== "0") {
      spawnSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
    }
  }
}

if (isWin) killPortWindows();
