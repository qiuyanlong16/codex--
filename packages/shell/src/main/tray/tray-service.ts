import { app, Menu, Tray, nativeImage, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createPlaceholderTrayIcon } from "./tray-icon.js";

function resolveTrayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(app.getAppPath(), "resources", "icons", "tray-icon.bmp"),
    path.join(process.resourcesPath, "icons", "tray-icon.bmp"),
    path.join(app.getAppPath(), "resources", "icons", "tray-icon.png"),
    path.join(process.resourcesPath, "icons", "tray-icon.png"),
    path.join(app.getAppPath(), "resources", "icons", "icon.png"),
    path.join(process.resourcesPath, "icons", "icon.png"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const image = nativeImage.createFromPath(candidate);
      if (!image.isEmpty()) {
        return image;
      }
    }
  }
  return createPlaceholderTrayIcon();
}

export type TrayService = {
  destroy: () => void;
  refreshContextMenu: () => void;
};

export function createTrayService(options: {
  getWindow: () => BrowserWindow | null;
  requestQuit: () => void;
  getLocale: () => string;
}): TrayService {
  const tray = new Tray(resolveTrayIcon());
  tray.setToolTip(app.getName());

  const showMainWindow = () => {
    const window = options.getWindow();
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };

  const buildContextMenu = () => {
    return Menu.buildFromTemplate([
      {
        label: "Open",
        click: () => showMainWindow(),
      },
      { type: "separator" },
      {
        label: "Exit",
        click: () => options.requestQuit(),
      },
    ]);
  };

  const refreshContextMenu = () => {
    tray.setContextMenu(buildContextMenu());
  };

  refreshContextMenu();
  tray.on("double-click", () => showMainWindow());

  return {
    destroy: () => tray.destroy(),
    refreshContextMenu,
  };
}
