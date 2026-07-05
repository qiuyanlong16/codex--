import type {
  StartupFailedEvent,
  StartupPhaseEvent,
  StartupReadyEvent,
  StartupStateSnapshot,
  TitleBarThemePayload,
} from "@byclaw-nanobot/shared";

export type ElectronHostApi = {
  app: {
    getInfo: () => Promise<{ version: string; productName: string; platform: string; arch: string }>;
    minimizeWindow: () => Promise<{ ok: boolean }>;
    maximizeWindow: () => Promise<{ ok: boolean }>;
    closeWindow: () => Promise<{ ok: boolean }>;
    isMaximized: () => Promise<{ maximized: boolean }>;
    openExternal: (url: string) => Promise<{ ok: boolean }>;
    setTitleBarTheme: (payload: TitleBarThemePayload) => Promise<{ ok: boolean }>;
    retryStartup: () => Promise<{ ok: boolean }>;
    onMaximizeChanged: (callback: (payload: { maximized: boolean }) => void) => () => void;
  };
  startup: {
    getState: () => Promise<StartupStateSnapshot>;
    onReady: (callback: (payload: StartupReadyEvent) => void) => () => void;
    onFailed: (callback: (payload: StartupFailedEvent) => void) => () => void;
    onPhase: (callback: (payload: StartupPhaseEvent) => void) => () => void;
  };
  nanobot: {
    onReady: (callback: (payload: unknown) => void) => () => void;
  };
};

declare global {
  interface Window {
    electronAPI?: ElectronHostApi;
  }
}

export function getElectronApi(): ElectronHostApi | null {
  if (typeof window === "undefined") return null;
  return window.electronAPI ?? null;
}

export function isElectronHost(): boolean {
  return getElectronApi() != null;
}
