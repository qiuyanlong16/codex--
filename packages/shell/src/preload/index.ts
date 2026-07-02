/**
 * Preload bridge — sandbox-safe.
 */
import { contextBridge, ipcRenderer } from "electron";
import type {
  AppInfoResponse,
  NanobotReadyEvent,
  LogExportBundleRequest,
  LogExportBundleResponse,
  LogWriteRequest,
  StartupFailedEvent,
  StartupReadyEvent,
  StartupStateSnapshot,
} from "@byclaw-nanobot/shared";
import { IPC, IPC_EVENTS } from "@byclaw-nanobot/shared";

function invoke(channel: string, payload?: unknown): Promise<unknown> {
  return ipcRenderer.invoke(channel, payload);
}

function subscribeEvent<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const electronAPI = {
  app: {
    getInfo: () => invoke(IPC.app.getInfo) as Promise<AppInfoResponse>,
    minimizeWindow: () => invoke(IPC.app.minimizeWindow) as Promise<{ ok: boolean }>,
    maximizeWindow: () => invoke(IPC.app.maximizeWindow) as Promise<{ ok: boolean }>,
    closeWindow: () => invoke(IPC.app.closeWindow) as Promise<{ ok: boolean }>,
    openExternal: (url: string) =>
      invoke(IPC.app.openExternal, { url }) as Promise<{ ok: boolean }>,
  },
  startup: {
    getState: () => invoke(IPC.startup.getState) as Promise<StartupStateSnapshot>,
    onReady: (callback: (payload: StartupReadyEvent) => void) =>
      subscribeEvent(IPC_EVENTS.startupReady, callback),
    onFailed: (callback: (payload: StartupFailedEvent) => void) =>
      subscribeEvent(IPC_EVENTS.startupFailed, callback),
  },
  nanobot: {
    onReady: (callback: (payload: NanobotReadyEvent) => void) =>
      subscribeEvent(IPC_EVENTS.nanobotReady, callback),
  },
  log: {
    write: (event: LogWriteRequest) =>
      invoke(IPC.log.write, event) as Promise<{ accepted: boolean }>,
    exportBundle: (input: LogExportBundleRequest) =>
      invoke(IPC.log.exportBundle, input) as Promise<LogExportBundleResponse>,
  },
  onLogPolicyChanged: (callback: (payload: unknown) => void) =>
    subscribeEvent(IPC_EVENTS.logPolicyChanged, callback),
  onEncryptKeyReady: (callback: (payload: { key: string }) => void) =>
    subscribeEvent(IPC_EVENTS.encryptKeyReady, callback),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
