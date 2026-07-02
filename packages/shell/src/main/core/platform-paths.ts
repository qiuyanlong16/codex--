import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export { getByclawHomeDir } from "./byclaw-home.js";

/** App data folder name — Windows: `%LOCALAPPDATA%/ByNanobot`. */
export const PRODUCT_USER_DATA_DIR_NAME = "ByNanobot";

export function resolveProductUserDataPath(platform = process.platform): string {
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, PRODUCT_USER_DATA_DIR_NAME);
  }
  if (platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", PRODUCT_USER_DATA_DIR_NAME);
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME;
  if (xdgConfig) {
    return path.join(xdgConfig, PRODUCT_USER_DATA_DIR_NAME);
  }
  return path.join(os.homedir(), ".config", PRODUCT_USER_DATA_DIR_NAME);
}

/** Must run before `app.whenReady()` — overrides Electron default Roaming path. */
export function configureProductUserDataPath(): void {
  app.setPath("userData", resolveProductUserDataPath());
}

export function resolveResourcesPath(): string | null {
  return typeof process.resourcesPath === "string" && process.resourcesPath.length > 0
    ? process.resourcesPath
    : null;
}
