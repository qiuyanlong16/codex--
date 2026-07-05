import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Dev-only: resolve the nanobot WebUI/API/WS port for Vite proxy.
 * Must match packages/shell resolveNanobotMainServerPort — NOT gateway.port (health).
 */
export function resolveDevGatewayTarget(env = process.env) {
  if (env.NANOBOT_API_URL?.trim()) return env.NANOBOT_API_URL.trim();
  try {
    const configPath = path.join(os.homedir(), ".nanobot", "config.json");
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const wsPort = cfg?.channels?.websocket?.port;
    if (typeof wsPort === "number" && wsPort > 0) {
      const host = cfg?.channels?.websocket?.host?.trim() || "127.0.0.1";
      return `http://${host}:${wsPort}`;
    }
  } catch {
    // fall through to default
  }
  return "http://127.0.0.1:8766";
}
