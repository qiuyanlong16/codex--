import os from "node:os";
import path from "node:path";

/** Home directory for by-claw-nanobot state. Override with `BYCLAW_HOME`. */
export function getByclawHomeDir(): string {
  const override = process.env.BYCLAW_HOME?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), ".by-claw-nanobot");
}
