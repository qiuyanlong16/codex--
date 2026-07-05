/**
 * IPC channel SSOT — by-claw-nanobot.
 * Minimal set for the Electron shell + Splash page.
 */
import type {
  AppInfoResponse,
  NanobotReadyEvent,
  LogExportBundleRequest,
  LogExportBundleResponse,
  LogWriteRequest,
  StartupFailedEvent,
  StartupPhaseEvent,
  StartupReadyEvent,
  StartupStateSnapshot,
  TitleBarThemePayload,
} from "./telemetry.js";

export const IPC = {
  app: {
    getInfo: "app:getInfo",
    minimizeWindow: "app:minimizeWindow",
    maximizeWindow: "app:maximizeWindow",
    closeWindow: "app:closeWindow",
    openExternal: "app:openExternal",
    isMaximized: "app:isMaximized",
    setTitleBarTheme: "app:setTitleBarTheme",
    retryStartup: "app:retryStartup",
  },
  log: {
    write: "log:write",
    exportBundle: "log:exportBundle",
  },
  startup: {
    getState: "startup:getState",
  },
} as const;

export const IPC_EVENTS = {
  logPolicyChanged: "log:policyChanged",
  startupReady: "startup:ready",
  startupFailed: "startup:failed",
  startupPhase: "startup:phase",
  nanobotReady: "nanobot:ready",
  encryptKeyReady: "encrypt:keyReady",
  windowMaximizedChanged: "window:maximizedChanged",
} as const;

export type IpcInvokeChannel =
  | typeof IPC.app.getInfo
  | typeof IPC.app.minimizeWindow
  | typeof IPC.app.maximizeWindow
  | typeof IPC.app.closeWindow
  | typeof IPC.app.openExternal
  | typeof IPC.app.isMaximized
  | typeof IPC.app.setTitleBarTheme
  | typeof IPC.app.retryStartup
  | typeof IPC.log.write
  | typeof IPC.log.exportBundle
  | typeof IPC.startup.getState;

export type IpcEventChannel =
  | typeof IPC_EVENTS.logPolicyChanged
  | typeof IPC_EVENTS.startupReady
  | typeof IPC_EVENTS.startupFailed
  | typeof IPC_EVENTS.startupPhase
  | typeof IPC_EVENTS.nanobotReady
  | typeof IPC_EVENTS.encryptKeyReady
  | typeof IPC_EVENTS.windowMaximizedChanged;

export interface IpcRequestMap {
  [IPC.app.getInfo]: undefined;
  [IPC.app.minimizeWindow]: undefined;
  [IPC.app.maximizeWindow]: undefined;
  [IPC.app.closeWindow]: undefined;
  [IPC.app.openExternal]: { url: string };
  [IPC.app.isMaximized]: undefined;
  [IPC.app.setTitleBarTheme]: TitleBarThemePayload;
  [IPC.app.retryStartup]: undefined;
  [IPC.log.write]: LogWriteRequest;
  [IPC.log.exportBundle]: LogExportBundleRequest;
  [IPC.startup.getState]: undefined;
}

export interface IpcResponseMap {
  [IPC.app.getInfo]: AppInfoResponse;
  [IPC.app.minimizeWindow]: { ok: boolean };
  [IPC.app.maximizeWindow]: { ok: boolean };
  [IPC.app.closeWindow]: { ok: boolean };
  [IPC.app.openExternal]: { ok: boolean };
  [IPC.app.isMaximized]: { maximized: boolean };
  [IPC.app.setTitleBarTheme]: { ok: boolean };
  [IPC.app.retryStartup]: { ok: boolean };
  [IPC.log.write]: { accepted: boolean };
  [IPC.log.exportBundle]: LogExportBundleResponse;
  [IPC.startup.getState]: StartupStateSnapshot;
}

export const IPC_INVOKE_CHANNELS: readonly IpcInvokeChannel[] = [
  IPC.app.getInfo,
  IPC.app.minimizeWindow,
  IPC.app.maximizeWindow,
  IPC.app.closeWindow,
  IPC.app.openExternal,
  IPC.app.isMaximized,
  IPC.app.setTitleBarTheme,
  IPC.app.retryStartup,
  IPC.log.write,
  IPC.log.exportBundle,
  IPC.startup.getState,
];

export type { NanobotReadyEvent, StartupPhaseEvent, StartupReadyEvent, StartupFailedEvent, TitleBarThemePayload };
