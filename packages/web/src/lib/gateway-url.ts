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
