import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { app, BrowserWindow } from "electron";
import { IPC, IPC_EVENTS } from "@byclaw-nanobot/shared";
import type { NanobotReadyEvent, StartupFailedEvent, StartupPhaseEvent, StartupReadyEvent, TitleBarThemePayload } from "@byclaw-nanobot/shared";
import { initMainLogger, mainLog } from "./core/logging/main-logger.js";
import { configureProductUserDataPath, getByclawHomeDir, resolveProductUserDataPath } from "./core/platform-paths.js";
import { runFirstRunSetup } from "./nanobot/first-run-setup.js";
import {
  registerAppHandlers,
  registerWindowHandlers,
  registerLogHandlers,
} from "./ipc/register-handlers.js";
import { NanobotRuntimeService } from "./nanobot/nanobot-runtime-service.js";
import { DEFAULT_BIND_HOST } from "./nanobot/nanobot-constants.js";
import { resolveNanobotMainServerPort } from "./nanobot/nanobot-bundle.js";
import { createTrayService, type TrayService } from "./tray/tray-service.js";
import {
  getStartupState,
  markStartupReady,
  markStartupFailed,
  resetStartupSnapshot,
} from "./core/startup-state.js";

// Very early init log - writes before anything else
try {
  const fs = require("node:fs");
  const earlyLogPath = path.join(resolveProductUserDataPath(), "early.log");
  fs.mkdirSync(path.dirname(earlyLogPath), { recursive: true });
  fs.appendFileSync(earlyLogPath, `[${new Date().toISOString()}] Module loaded, pid=${process.pid}\n`);
} catch (err) {
  // Can't write log - ignore
}

// Early crash handler - writes to a file that doesn't depend on electron-log
const _crashLogPath = path.join(resolveProductUserDataPath(), "crash.log");
process.on("uncaughtException", (err) => {
  try {
    const fs = require("node:fs");
    fs.mkdirSync(path.dirname(_crashLogPath), { recursive: true });
    fs.appendFileSync(_crashLogPath, `[${new Date().toISOString()}] uncaughtException: ${err.message}\n${err.stack ?? ""}\n\n`);
  } catch { /* ignore */ }
});
process.on("unhandledRejection", (reason) => {
  try {
    const fs = require("node:fs");
    const msg = reason instanceof Error ? reason.message : String(reason);
    fs.mkdirSync(path.dirname(_crashLogPath), { recursive: true });
    fs.appendFileSync(_crashLogPath, `[${new Date().toISOString()}] unhandledRejection: ${msg}\n\n`);
  } catch { /* ignore */ }
});

configureProductUserDataPath();

// ── Single-instance guard ────────────────────────────────────────
// Prevent multiple Electron processes. When a second instance tries
// to start, focus the existing window instead of spawning a new one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.exit(0);
}
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
// ──────────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV === "development";
const DEV_SERVER = "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let trayService: TrayService | null = null;
let isQuitting = false;
let gatewayUrl: string | null = null;
let startupInFlight: Promise<void> | null = null;
let currentTitleBarTheme: TitleBarThemePayload["mode"] = "light";

const TITLE_BAR_THEMES: Record<TitleBarThemePayload["mode"], { color: string; symbolColor: string; backgroundColor: string }> = {
  light: { color: "#f4f3f1", symbolColor: "#6b6b6b", backgroundColor: "#f4f3f1" },
  dark: { color: "#161618", symbolColor: "#e5e5e5", backgroundColor: "#161618" },
};

function resolvePackagedWebUiUrl(): string | null {
  const candidates = [
    path.join(process.resourcesPath, "webui-dist", "index.html"),
    path.join(app.getAppPath(), "webui-dist", "index.html"),
    path.join(app.getAppPath(), "..", "webui-dist", "index.html"),
    path.join(__dirname, "../../../web/dist/index.html"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return pathToFileURL(candidate).href;
    }
  }
  return null;
}

function applyTitleBarTheme(mode: TitleBarThemePayload["mode"]): void {
  currentTitleBarTheme = mode;
  const palette = TITLE_BAR_THEMES[mode];
  if (mainWindow && process.platform === "win32") {
    mainWindow.setBackgroundColor(palette.backgroundColor);
    mainWindow.setTitleBarOverlay({
      color: palette.color,
      symbolColor: palette.symbolColor,
      height: 36,
    });
  }
}

function emitStartupPhase(phase: StartupPhaseEvent["phase"], detail?: string): void {
  sendToRenderer(IPC_EVENTS.startupPhase, { phase, detail } satisfies StartupPhaseEvent);
}

const LOADING_HTML = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #f4f3f1;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container {
      text-align: center;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: #6b6b6b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .text {
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <div class="text">Starting nanobot...</div>
  </div>
</body>
</html>
`;

function resolveWebUrl(): string {
  if (isDev) return DEV_SERVER;
  if (gatewayUrl) return gatewayUrl;
  return resolvePackagedWebUiUrl() ?? `data:text/html,${encodeURIComponent(LOADING_HTML)}`;
}

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

async function waitForRendererReady(win: BrowserWindow): Promise<void> {
  if (win.webContents.isLoading()) {
    await new Promise<void>((resolve) => {
      win.webContents.once("did-finish-load", () => resolve());
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
}

async function emitStartupEvent(
  channel: typeof IPC_EVENTS.startupReady | typeof IPC_EVENTS.startupFailed,
  payload: StartupReadyEvent | StartupFailedEvent,
): Promise<void> {
  if (mainWindow) {
    await waitForRendererReady(mainWindow);
  }
  sendToRenderer(channel, payload);
}

async function createWindow(): Promise<BrowserWindow> {
  const initialTheme = TITLE_BAR_THEMES[currentTitleBarTheme];
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    show: false,
    backgroundColor: initialTheme.backgroundColor,
    titleBarStyle: process.platform === "win32" ? "hidden" : "default",
    titleBarOverlay: process.platform === "win32" ? {
      color: initialTheme.color,
      symbolColor: initialTheme.symbolColor,
      height: 36,
    } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  // Load URL first, then show window when ready (no white flash)
  await win.loadURL(resolveWebUrl());
  win.show();
  return win;
}

function requestQuit(): void {
  isQuitting = true;
  app.quit();
}

async function reportStartupFailure(code: string): Promise<void> {
  const logDir = app.getPath("userData");
  const failed: StartupFailedEvent = {
    code,
    message: code,
    i18nKey: "startup.nanobotNotReady",
    logDir,
  };
  markStartupFailed(failed);
  emitStartupPhase("failed", code);
  await emitStartupEvent(IPC_EVENTS.startupFailed, failed);
}

async function bootstrap(): Promise<void> {
  resetStartupSnapshot();
  initMainLogger(app.getPath("userData"), isDev);

  registerAppHandlers({
    applyTitleBarTheme,
    retryStartup: () => {
      if (startupInFlight) return startupInFlight;
      resetStartupSnapshot();
      emitStartupPhase("first_run");
      startupInFlight = runBackgroundStartup().finally(() => {
        startupInFlight = null;
      });
      return startupInFlight;
    },
  });
  registerLogHandlers();

  mainWindow = await createWindow();
  registerWindowHandlers(() => mainWindow);

  trayService = createTrayService({
    getWindow: () => mainWindow,
    requestQuit,
    getLocale: () => app.getLocale(),
  });

  mainLog.info("lifecycle", `codex-- shell window ready (${isDev ? "dev" : "prod"})`);
  sendToRenderer(IPC_EVENTS.logPolicyChanged, { ready: true });

  const encryptKey = randomBytes(16).toString("hex");
  sendToRenderer(IPC_EVENTS.encryptKeyReady, { key: encryptKey });

  void runBackgroundStartup();
}

async function runBackgroundStartup(): Promise<void> {
  emitStartupPhase("first_run");
  await runFirstRunSetup();
  const stateDir = getByclawHomeDir();
  const nanobotRuntime = new NanobotRuntimeService(stateDir);

  try {
    emitStartupPhase("spawning");
    const phasePoller = setInterval(() => {
      const phase = nanobotRuntime.getGatewayStartupPhase();
      if (phase === "spawning" || phase === "healthz_ok" || phase === "awaiting_readyz") {
        emitStartupPhase(phase);
      }
    }, 400);
    const integrity = await nanobotRuntime.ensureReady();
    clearInterval(phasePoller);

    let nanobotHealthy = false;
    let nanobotVersion: string | undefined;
    const readyzPassed = nanobotRuntime.getGatewayStartupPhase() === "ready";
    const gatewayPhase = nanobotRuntime.getGatewayStartupPhase();
    if (gatewayPhase === "healthz_ok" || gatewayPhase === "awaiting_readyz" || gatewayPhase === "ready") {
      emitStartupPhase(gatewayPhase === "ready" ? "awaiting_readyz" : gatewayPhase);
    }
    if (gatewayPhase === "ready") {
      emitStartupPhase("ready");
    }

    if (integrity.state === "ready") {
      nanobotHealthy = true;
    } else if (isDev) {
      mainLog.warn("lifecycle", "nanobot unavailable in dev — continuing with UI only", {
        code: integrity.errorCode,
      });
    } else {
      throw new Error(integrity.errorCode ?? "nanobot_not_ready");
    }

    const host = DEFAULT_BIND_HOST;
    // Architecture: gateway runs TWO servers:
    //   - health port (18790): only serves /health, used for health checks
    //   - main server port (from config, default 8765): serves WebUI + API + WebSocket
    // The WebUI must be loaded from the MAIN server port, not the health port.
    const configuredPort = resolveNanobotMainServerPort();
    // Try configured port first, then common alternatives
    const candidatePorts = [configuredPort, 8765, 8766].filter(
      (p, i, arr) => arr.indexOf(p) === i, // deduplicate
    );
    let mainServerPort = configuredPort;
    for (const port of candidatePorts) {
      try {
        const resp = await fetch(`http://${host}:${port}/`, {
          signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) {
          mainServerPort = port;
          mainLog.info("lifecycle", "found WebUI port", { port });
          break;
        }
      } catch {
        // try next
      }
    }
    const nanobotUrl = `http://${host}:${mainServerPort}`;
    gatewayUrl = nanobotUrl;
    mainLog.info("lifecycle", "resolved nanobot URL", {
      configuredPort,
      resolvedPort: mainServerPort,
      url: nanobotUrl,
    });

    const nanobotReady: NanobotReadyEvent = {
      nanobotPort: mainServerPort,
      nanobotUrl,
      nanobotHealthy,
      nanobotVersion,
      host,
      readyzPassed,
    };
    sendToRenderer(IPC_EVENTS.nanobotReady, nanobotReady);

    // Load the WebUI from the main server (serves WebUI + API + WebSocket)
    if (mainWindow && !isDev) {
      mainLog.info("lifecycle", "loading WebUI", { url: nanobotUrl });
      try {
        await mainWindow.loadURL(nanobotUrl);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        mainLog.error("lifecycle", "loadURL failed", { url: nanobotUrl, detail });
        throw new Error(`loadurl_failed: ${detail}`);
      }
    }

    const startupReady: StartupReadyEvent = {
      nanobotPort: mainServerPort,
      nanobotHealthy,
      nanobotVersion,
      host,
      readyzPassed,
    };
    markStartupReady(startupReady);
    await emitStartupEvent(IPC_EVENTS.startupReady, startupReady);
    mainLog.info("lifecycle", "startup:ready", startupReady);

    // Nanobot gateway is running — the window already shows the WebUI
    // (Vite dev server in dev mode, local dist in prod). API calls from the
    // React app reach the gateway via Vite proxy (dev) or directly (prod).
    if (nanobotHealthy) {
      mainLog.info("lifecycle", "nanobot gateway healthy", { url: nanobotUrl });
    }
  } catch (err) {
    const code = err instanceof Error ? err.message : "startup_failed";
    await reportStartupFailure(code);
    mainLog.warn("lifecycle", "startup:failed", { code });
  }
}

app.whenReady().then(() => {
  void bootstrap().catch((err) => {
    mainLog.error("lifecycle", err instanceof Error ? err.message : String(err));
    app.exit(1);
  });
});

app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  BrowserWindow.getAllWindows().forEach((w) => w.destroy());
  void shutdownInBackground();
});

async function shutdownInBackground(): Promise<void> {
  trayService?.destroy();
  app.exit(0);
}

app.on("window-all-closed", () => {
  if (isQuitting) {
    if (process.platform !== "darwin") app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow().then((win) => {
      mainWindow = win;
    });
  } else {
    mainWindow?.show();
  }
});
