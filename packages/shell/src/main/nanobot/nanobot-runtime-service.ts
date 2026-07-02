import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BIND_HOST, NANOBOT_DEFAULT_PORT } from "./nanobot-constants.js";
import { mainLog } from "../core/logging/main-logger.js";
import {
  resolveNanobotBundle,
  resolveNanobotPythonExecutable,
  describeNanobotBundle,
  type NanobotBundleRef,
} from "./nanobot-bundle.js";

export type NanobotRuntimeContext = {
  sessionId: string;
  appVersion: string;
  appChannel?: string;
};

export type NanobotReadyState = "ready" | "missing" | "invalid";

export type NanobotRuntimePhase =
  | "stopped"
  | "starting"
  | "healthy"
  | "degraded"
  | "restarting"
  | "failed";

export type GatewayStartupPhase =
  | "idle"
  | "spawning"
  | "healthz_ok"
  | "awaiting_readyz"
  | "ready";

export interface NanobotIntegrityResult {
  state: NanobotReadyState;
  runtimeDir: string;
  version?: string;
  errorCode?: string;
}

const RESTART_INITIAL_MS = 500;
const RESTART_MAX_MS = 30_000;
const RESTART_MAX_ATTEMPTS = 5;
const RESTART_WINDOW_MS = 300_000;
const HEALTHZ_PROBE_MS = 3_000;
const STARTUP_HEALTHZ_TIMEOUT_MS = 90_000;
const READYZ_PROBE_MS = 3_000;
const STARTUP_READYZ_TIMEOUT_MS = 30_000;
const READYZ_POLL_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const started = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = createConnection({ host, port }, () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) {
          resolve(false);
        } else {
          setTimeout(tryOnce, 400);
        }
      });
    };
    tryOnce();
  });
}

async function probeHealthz(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${host}:${port}/`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class NanobotRuntimeService {
  private readonly stateDir: string;
  private readonly host: string;
  private gatewayPort: number;
  private bundleRef: NanobotBundleRef | null = null;
  private bundleRoot: string | null = null;
  private gatewayProcess: ChildProcess | null = null;
  private phase: NanobotRuntimePhase = "stopped";
  private gatewayStartupPhase: GatewayStartupPhase = "idle";
  private shuttingDown = false;
  private restartAttempts = 0;
  private restartWindowStart = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private spawnInFlight: Promise<void> | null = null;
  private readonly runtimeContext: NanobotRuntimeContext;

  constructor(
    stateDir: string,
    gatewayPort = NANOBOT_DEFAULT_PORT,
    host = DEFAULT_BIND_HOST,
    runtimeContext: NanobotRuntimeContext = {
      sessionId: "unknown",
      appVersion: "0.0.0",
    },
  ) {
    this.stateDir = stateDir;
    this.gatewayPort = gatewayPort;
    this.host = host;
    this.runtimeContext = runtimeContext;
  }

  getBundleRoot(): string | null {
    return this.bundleRoot;
  }

  getGatewayPort(): number {
    return this.gatewayPort;
  }

  getHost(): string {
    return this.host;
  }

  getPhase(): NanobotRuntimePhase {
    return this.phase;
  }

  getGatewayStartupPhase(): GatewayStartupPhase {
    return this.gatewayStartupPhase;
  }

  getStateDir(): string {
    return this.stateDir;
  }

  getNanobotUrl(): string {
    return `http://${this.host}:${this.gatewayPort}`;
  }

  private getPythonExecutable(): string {
    const pythonExe = resolveNanobotPythonExecutable(this.bundleRef);
    if (!pythonExe) {
      throw new Error("python_missing");
    }
    return pythonExe;
  }

  checkIntegrity(): NanobotIntegrityResult {
    if (!this.bundleRef) {
      return {
        state: "missing",
        runtimeDir: this.stateDir,
        errorCode: "nanobot_bundle_missing",
      };
    }
    if (!fs.existsSync(this.bundleRef.pythonExe)) {
      return {
        state: "missing",
        runtimeDir: this.bundleRef.root,
        errorCode: "python_missing",
      };
    }
    return {
      state: "ready",
      runtimeDir: this.bundleRef.root,
    };
  }

  prepareRuntime(): NanobotIntegrityResult {
    this.bundleRef = resolveNanobotBundle();
    this.bundleRoot = this.bundleRef?.root ?? null;
    fs.mkdirSync(this.stateDir, { recursive: true });
    if (this.bundleRef) {
      mainLog.info("nanobot", "bundle resolved", {
        bundle: describeNanobotBundle(this.bundleRef),
        pythonExe: this.bundleRef.pythonExe,
      });
    }
    return this.checkIntegrity();
  }

  async ensureReady(): Promise<NanobotIntegrityResult> {
    const integrity = this.prepareRuntime();
    if (integrity.state !== "ready") {
      return integrity;
    }
    try {
      await this.ensureGatewayRunning();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      mainLog.warn("nanobot", "gateway not ready", { detail });
      return {
        state: "invalid",
        runtimeDir: this.bundleRoot ?? this.stateDir,
        errorCode: detail,
      };
    }
    return this.checkIntegrity();
  }

  async whenHealthy(timeoutMs = 30_000): Promise<void> {
    if (this.phase === "failed") {
      throw new Error("nanobot_runtime_failed");
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (
        this.phase === "healthy" &&
        (await probeHealthz(this.host, this.gatewayPort, HEALTHZ_PROBE_MS))
      ) {
        return;
      }
      try {
        await this.ensureGatewayRunning();
      } catch {
        /* retry until deadline */
      }
      await sleep(400);
    }
    throw new Error("nanobot_runtime_unhealthy_timeout");
  }

  async ensureGatewayRunning(): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("nanobot_shutting_down");
    }
    if (this.spawnInFlight) {
      return this.spawnInFlight;
    }

    this.spawnInFlight = this.ensureGatewayRunningInner().finally(() => {
      this.spawnInFlight = null;
    });
    return this.spawnInFlight;
  }

  private async ensureGatewayRunningInner(): Promise<void> {
    if (
      this.gatewayProcess &&
      !this.gatewayProcess.killed &&
      (await probeHealthz(this.host, this.gatewayPort, HEALTHZ_PROBE_MS))
    ) {
      this.phase = "healthy";
      return;
    }

    if (await probeHealthz(this.host, this.gatewayPort, HEALTHZ_PROBE_MS)) {
      this.phase = "healthy";
      return;
    }

    await this.spawnGateway();
  }

  private async spawnGateway(): Promise<void> {
    if (this.shuttingDown) {
      throw new Error("nanobot_shutting_down");
    }

    this.clearRestartTimer();
    this.phase = this.phase === "restarting" ? "restarting" : "starting";
    this.gatewayStartupPhase = "spawning";

    const pythonExe = this.getPythonExecutable();

    mainLog.info("nanobot", "spawning nanobot serve", {
      pythonExe,
      port: this.gatewayPort,
      phase: this.phase,
    });

    const child = spawn(
      pythonExe,
      [
        "-m",
        "nanobot",
        "serve",
        "--port",
        String(this.gatewayPort),
        "--host",
        this.host,
      ],
      {
        cwd: this.stateDir,
        env: {
          ...process.env,
          NANOBOT_HOME: this.stateDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    this.gatewayProcess = child;

    child.stdout?.on("data", (chunk: Buffer) => {
      mainLog.info("nanobot", chunk.toString().trim());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      mainLog.warn("nanobot", chunk.toString().trim());
    });

    child.on("exit", (code, signal) => {
      if (this.gatewayProcess === child) {
        this.gatewayProcess = null;
      }
      this.handleProcessExit(code, signal);
    });

    const ready = await this.waitForHealthyGateway(STARTUP_HEALTHZ_TIMEOUT_MS);
    if (!ready) {
      this.killGatewayProcess(child);
      throw new Error("nanobot_gateway_start_timeout");
    }

    this.gatewayStartupPhase = "healthz_ok";
    mainLog.info("nanobot", "healthz passed, awaiting readyz");

    this.gatewayStartupPhase = "awaiting_readyz";
    const readyzOk = await this.waitForReadyGateway(STARTUP_READYZ_TIMEOUT_MS);

    if (readyzOk) {
      this.gatewayStartupPhase = "ready";
      mainLog.info("nanobot", "readyz passed");
    } else {
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        this.gatewayStartupPhase = "ready";
        mainLog.warn("nanobot", "readyz timed out in dev — continuing anyway");
      } else {
        this.killGatewayProcess(child);
        throw new Error("nanobot_gateway_readyz_timeout");
      }
    }

    this.phase = "healthy";
    this.restartAttempts = 0;
    this.restartWindowStart = 0;
    mainLog.info("nanobot", "gateway listening", {
      url: this.getNanobotUrl(),
      phase: this.phase,
      readyz: readyzOk,
    });
  }

  private async waitForHealthyGateway(timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await probeHealthz(this.host, this.gatewayPort, HEALTHZ_PROBE_MS)) {
        return true;
      }
      if (await waitForPort(this.host, this.gatewayPort, 800)) {
        if (await probeHealthz(this.host, this.gatewayPort, HEALTHZ_PROBE_MS)) {
          return true;
        }
      }
      await sleep(400);
    }
    return false;
  }

  private async waitForReadyGateway(timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (this.shuttingDown) return false;
      if (await probeHealthz(this.host, this.gatewayPort, READYZ_PROBE_MS)) {
        return true;
      }
      await sleep(READYZ_POLL_INTERVAL_MS);
    }
    return false;
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.gatewayStartupPhase = "idle";
    if (this.shuttingDown) {
      this.phase = "stopped";
      return;
    }

    mainLog.warn("nanobot", "gateway subprocess exited", { code, signal });
    this.phase = "degraded";
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (this.shuttingDown) return;

    const now = Date.now();
    if (!this.restartWindowStart || now - this.restartWindowStart > RESTART_WINDOW_MS) {
      this.restartWindowStart = now;
      this.restartAttempts = 0;
    }

    this.restartAttempts += 1;
    if (this.restartAttempts > RESTART_MAX_ATTEMPTS) {
      this.phase = "failed";
      mainLog.error("nanobot", "restart circuit breaker open", {
        attempts: this.restartAttempts,
      });
      return;
    }

    const delay = Math.min(RESTART_INITIAL_MS * 2 ** (this.restartAttempts - 1), RESTART_MAX_MS);
    this.phase = "restarting";
    mainLog.info("nanobot", "scheduling gateway restart", {
      delayMs: delay,
      attempt: this.restartAttempts,
    });

    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      void this.ensureGatewayRunning().catch((err) => {
        mainLog.warn("nanobot", "scheduled restart failed", {
          detail: err instanceof Error ? err.message : String(err),
        });
      });
    }, delay);
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private killGatewayProcess(child: ChildProcess = this.gatewayProcess!): void {
    if (child && !child.killed) {
      child.kill();
    }
    if (this.gatewayProcess === child) {
      this.gatewayProcess = null;
    }
  }

  async restartGateway(): Promise<void> {
    this.clearRestartTimer();
    if (this.gatewayProcess && !this.gatewayProcess.killed) {
      this.gatewayProcess.kill();
      this.gatewayProcess = null;
    }
    this.phase = "restarting";
    await this.ensureGatewayRunning();
    await this.whenHealthy();
  }

  async stopGateway(): Promise<void> {
    this.shuttingDown = true;
    this.gatewayStartupPhase = "idle";
    this.clearRestartTimer();
    if (this.gatewayProcess && !this.gatewayProcess.killed) {
      this.gatewayProcess.kill();
      this.gatewayProcess = null;
    }
    this.phase = "stopped";
  }

  async gracefulShutdown(timeoutMs = 5000): Promise<void> {
    this.shuttingDown = true;
    this.gatewayStartupPhase = "idle";
    this.clearRestartTimer();

    const child = this.gatewayProcess;
    if (child && !child.killed) {
      child.kill("SIGTERM");

      await Promise.race([
        new Promise<void>((resolve) => {
          child.once("exit", () => resolve());
        }),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]);

      if (!child.killed) {
        mainLog.warn("nanobot", "gateway did not exit in time, sending SIGKILL");
        child.kill("SIGKILL");
      }
    }

    this.gatewayProcess = null;
    this.phase = "stopped";
  }
}
