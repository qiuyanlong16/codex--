import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { app, BrowserWindow } from "electron";
import { IPC, IPC_EVENTS } from "@byclaw-nanobot/shared";
import type { NanobotReadyEvent, StartupFailedEvent, StartupReadyEvent } from "@byclaw-nanobot/shared";
import { initMainLogger, mainLog } from "./core/logging/main-logger.js";
import { configureProductUserDataPath, getByclawHomeDir } from "./core/platform-paths.js";
import {
  registerAppHandlers,
  registerWindowHandlers,
  registerLogHandlers,
} from "./ipc/register-handlers.js";
import { NanobotRuntimeService } from "./nanobot/nanobot-runtime-service.js";
import { DEFAULT_BIND_HOST } from "./nanobot/nanobot-constants.js";
import { createTrayService, type TrayService } from "./tray/tray-service.js";
import {
  getStartupState,
  markStartupReady,
  markStartupFailed,
  resetStartupSnapshot,
} from "./core/startup-state.js";

configureProductUserDataPath();

const isDev = process.env.NODE_ENV === "development";
const DEV_SERVER = "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let trayService: TrayService | null = null;
let isQuitting = false;

function resolveWebUrl(): string {
  if (isDev) return DEV_SERVER;
  const indexHtml = path.join(app.getAppPath(), "packages", "web", "dist", "index.html");
  return pathToFileURL(indexHtml).href;
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
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    show: false,
    backgroundColor: "#f4f3f1",
    ...(process.platform === "win32"
      ? { frame: false as const }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  await win.loadURL(resolveWebUrl());
  return win;
}

function requestQuit(): void {
  isQuitting = true;
  app.quit();
}

async function reportStartupFailure(code: string): Promise<void> {
  const failed: StartupFailedEvent = { code, message: code, i18nKey: "startup.nanobotNotReady" };
  markStartupFailed(failed);
  await emitStartupEvent(IPC_EVENTS.startupFailed, failed);
}

async function bootstrap(): Promise<void> {
  resetStartupSnapshot();
  initMainLogger(app.getPath("userData"), isDev);

  registerAppHandlers();
  registerLogHandlers();

  mainWindow = await createWindow();
  registerWindowHandlers(() => mainWindow);

  trayService = createTrayService({
    getWindow: () => mainWindow,
    requestQuit,
    getLocale: () => app.getLocale(),
  });

  mainLog.info("lifecycle", `by-claw-nanobot shell window ready (${isDev ? "dev" : "prod"})`);
  sendToRenderer(IPC_EVENTS.logPolicyChanged, { ready: true });

  const encryptKey = randomBytes(16).toString("hex");
  sendToRenderer(IPC_EVENTS.encryptKeyReady, { key: encryptKey });

  void runBackgroundStartup();
}

async function runBackgroundStartup(): Promise<void> {
  const stateDir = getByclawHomeDir();
  const nanobotRuntime = new NanobotRuntimeService(stateDir);

  try {
    const integrity = await nanobotRuntime.ensureReady();

    let nanobotHealthy = false;
    let nanobotVersion: string | undefined;
    const readyzPassed = nanobotRuntime.getGatewayStartupPhase() === "ready";

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
    const nanobotPort = nanobotRuntime.getGatewayPort();
    const nanobotUrl = `http://${host}:${nanobotPort}`;

    const nanobotReady: NanobotReadyEvent = {
      nanobotPort,
      nanobotUrl,
      nanobotHealthy,
      nanobotVersion,
      host,
      readyzPassed,
    };
    sendToRenderer(IPC_EVENTS.nanobotReady, nanobotReady);

    const startupReady: StartupReadyEvent = {
      nanobotPort,
      nanobotHealthy,
      nanobotVersion,
      host,
      readyzPassed,
    };
    markStartupReady(startupReady);
    await emitStartupEvent(IPC_EVENTS.startupReady, startupReady);
    mainLog.info("lifecycle", "startup:ready", startupReady);

    // After nanobot is ready, switch the BrowserWindow to the WebUI
    if (nanobotHealthy && mainWindow && !mainWindow.isDestroyed()) {
      mainLog.info("lifecycle", "loading nanobot WebUI", { url: nanobotUrl });
      await mainWindow.loadURL(nanobotUrl);
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
