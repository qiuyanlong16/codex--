/// <reference types="vite/client" />

import type { IPC, IPC_EVENTS } from "@byclaw-nanobot/shared";

interface ElectronAPI {
  app: {
    getInfo: () => Promise<{ version: string; productName: string; platform: string; arch: string }>;
    minimizeWindow: () => Promise<{ ok: boolean }>;
    maximizeWindow: () => Promise<{ ok: boolean }>;
    closeWindow: () => Promise<{ ok: boolean }>;
    openExternal: (args: { url: string }) => Promise<{ ok: boolean }>;
  };
  startup: {
    getState: () => Promise<{
      phase: "idle" | "starting" | "ready" | "failed";
      readyEvent?: import("@byclaw-nanobot/shared").StartupReadyEvent;
      failedEvent?: import("@byclaw-nanobot/shared").StartupFailedEvent;
    }>;
    onReady: (cb: (payload: import("@byclaw-nanobot/shared").StartupReadyEvent) => void) => () => void;
    onFailed: (cb: (payload: import("@byclaw-nanobot/shared").StartupFailedEvent) => void) => () => void;
  };
  nanobot: {
    onReady: (cb: (payload: import("@byclaw-nanobot/shared").NanobotReadyEvent) => void) => () => void;
  };
  onEncryptKeyReady: ((cb: (payload: { key: string }) => void) => () => void) | undefined;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
