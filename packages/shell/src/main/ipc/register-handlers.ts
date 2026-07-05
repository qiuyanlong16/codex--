import { app, ipcMain, shell } from "electron";
import { IPC, IPC_EVENTS } from "@byclaw-nanobot/shared";
import type { LogWriteRequest, TitleBarThemePayload } from "@byclaw-nanobot/shared";
import { getStartupState } from "../core/startup-state.js";

export type AppHandlerOptions = {
  applyTitleBarTheme?: (payload: TitleBarThemePayload) => void;
  retryStartup?: () => Promise<void>;
};

export function registerAppHandlers(options: AppHandlerOptions = {}): void {
  ipcMain.handle(IPC.app.getInfo, () => {
    return {
      version: app.getVersion(),
      productName: app.getName(),
      platform: process.platform,
      arch: process.arch,
    };
  });

  ipcMain.handle(IPC.startup.getState, () => {
    return getStartupState();
  });

  ipcMain.handle(IPC.app.setTitleBarTheme, (_event, payload: TitleBarThemePayload) => {
    options.applyTitleBarTheme?.(payload);
    return { ok: true };
  });

  ipcMain.handle(IPC.app.retryStartup, async () => {
    if (!options.retryStartup) return { ok: false };
    await options.retryStartup();
    return { ok: true };
  });
}

export function registerWindowHandlers(getWindow: () => Electron.BrowserWindow | null): void {
  ipcMain.handle(IPC.app.minimizeWindow, () => {
    getWindow()?.minimize();
    return { ok: true };
  });

  ipcMain.handle(IPC.app.maximizeWindow, () => {
    const win = getWindow();
    if (!win) return { ok: false };
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return { ok: true };
  });

  ipcMain.handle(IPC.app.closeWindow, () => {
    getWindow()?.hide();
    return { ok: true };
  });

  ipcMain.handle(IPC.app.isMaximized, () => {
    return { maximized: getWindow()?.isMaximized() ?? false };
  });

  ipcMain.handle(IPC.app.openExternal, (_event, args: { url: string }) => {
    void shell.openExternal(args.url);
    return { ok: true };
  });

  // Push maximize/unmaximize state changes to the renderer so the titlebar
  // icon can flip between "maximize" and "restore" without polling.
  const win = getWindow();
  if (win) {
    win.on("maximize", () => {
      win.webContents.send(IPC_EVENTS.windowMaximizedChanged, { maximized: true });
    });
    win.on("unmaximize", () => {
      win.webContents.send(IPC_EVENTS.windowMaximizedChanged, { maximized: false });
    });
  }
}

export function registerLogHandlers(): void {
  ipcMain.handle(IPC.log.write, (_event, req: LogWriteRequest) => {
    // In the minimal version, logs are handled by electron-log in the main process
    return { accepted: true };
  });

  ipcMain.handle(IPC.log.exportBundle, () => {
    return { filePath: "", sizeBytes: 0 };
  });
}
