/**
 * Type declarations for the Electron preload bridge (window.electronAPI).
 *
 * The preload script lives in the shell package and exposes this object via
 * contextBridge. These types let the renderer call the bridge without
 * importing from the shell package directly.
 */

interface ElectronHostAppApi {
  getInfo(): Promise<{
    version: string;
    productName: string;
    platform: string;
    arch: string;
  }>;
  minimizeWindow(): Promise<{ ok: boolean }>;
  maximizeWindow(): Promise<{ ok: boolean }>;
  closeWindow(): Promise<{ ok: boolean }>;
  isMaximized(): Promise<{ maximized: boolean }>;
  openExternal(url: string): Promise<{ ok: boolean }>;
  onMaximizeChanged(callback: (payload: { maximized: boolean }) => void): () => void;
}

interface ElectronHostApi {
  app: ElectronHostAppApi;
  startup: {
    getState(): Promise<{
      phase: "idle" | "starting" | "ready" | "failed";
      readyEvent?: unknown;
      failedEvent?: unknown;
    }>;
    onReady(callback: (payload: unknown) => void): () => void;
    onFailed(callback: (payload: unknown) => void): () => void;
  };
  nanobot: {
    onReady(callback: (payload: unknown) => void): () => void;
  };
  log: {
    write(event: unknown): Promise<{ accepted: boolean }>;
    exportBundle(input: unknown): Promise<{ filePath: string; sizeBytes: number }>;
  };
  onLogPolicyChanged(callback: (payload: unknown) => void): () => void;
  onEncryptKeyReady(callback: (payload: { key: string }) => void): () => void;
}

interface Window {
  electronAPI?: ElectronHostApi;
}
