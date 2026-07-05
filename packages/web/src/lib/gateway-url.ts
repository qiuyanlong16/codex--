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

function isViteDevServer(): boolean {
  return typeof window !== "undefined" && window.location.port === "5173";
}

function isPackagedFileShell(): boolean {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

/** Dev Vite (5173) must use same-origin proxy; packaged shell hits gateway directly. */
export function resolveBootstrapBaseUrl(gatewayUrl: string | null): string {
  if (!gatewayUrl) return "";
  if (typeof window === "undefined") return gatewayUrl;
  if (isViteDevServer()) return "";
  if (isPackagedFileShell()) return gatewayUrl;
  try {
    if (window.location.host === new URL(gatewayUrl).host) return "";
  } catch {
    // ignore malformed gateway URL
  }
  return gatewayUrl;
}

/**
 * HTTP base for REST calls. Empty on Vite dev (proxy); absolute gateway URL on
 * packaged file:// Electron. Never leave file:// pages hitting `/api/*` as
 * `file:///C:/api/*` on Windows.
 */
export function resolveApiBaseUrl(explicitBase = ""): string {
  const trimmed = explicitBase.trim().replace(/\/$/, "");
  if (trimmed) return trimmed;
  const gateway = getGatewayBaseUrl().replace(/\/$/, "");
  if (gateway) return gateway;
  if (isViteDevServer()) return "";
  if (isPackagedFileShell()) return "http://127.0.0.1:8766";
  return "";
}

/**
 * Rewrite gateway-relative paths for packaged Electron.
 * - `/api/...` → `http://127.0.0.1:8766/api/...`
 * - `/brand/...` → `./brand/...` on file://
 */
export function resolveGatewayHttpUrl(pathOrUrl: string): string {
  const value = pathOrUrl.trim();
  if (!value) return value;
  if (/^(https?:|data:|blob:|nanobot-host:)/i.test(value)) return value;
  if (value.startsWith("./") || value.startsWith("../")) return value;

  if (value.startsWith("/brand/")) {
    return isPackagedFileShell() ? `.${value}` : value;
  }

  if (
    value.startsWith("/api/")
    || value.startsWith("/webui/")
    || value.startsWith("/auth/")
  ) {
    if (isViteDevServer()) return value;
    const base = resolveApiBaseUrl();
    return base ? `${base}${value}` : value;
  }

  return value;
}
