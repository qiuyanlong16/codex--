/** Resolved nanobot gateway base URL (Electron shell sets this via IPC). */
let gatewayBaseUrl = "";

export function setGatewayBaseUrl(port: number, host = "127.0.0.1"): void {
  gatewayBaseUrl = `http://${host}:${port}`;
}

export function getGatewayBaseUrl(): string {
  return gatewayBaseUrl;
}

export function clearGatewayBaseUrl(): void {
  gatewayBaseUrl = "";
}

/** Dev Vite (5173) must use same-origin proxy; packaged shell hits gateway directly. */
export function resolveBootstrapBaseUrl(gatewayUrl: string | null): string {
  if (!gatewayUrl) return "";
  if (typeof window === "undefined") return gatewayUrl;
  if (window.location.port === "5173") return "";
  if (window.location.protocol === "file:") return gatewayUrl;
  try {
    if (window.location.host === new URL(gatewayUrl).host) return "";
  } catch {
    // ignore malformed gateway URL
  }
  return gatewayUrl;
}
