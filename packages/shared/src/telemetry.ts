/** Telemetry & startup types for by-claw-nanobot. */

export interface AppInfoResponse {
  version: string;
  productName: string;
  platform: string;
  arch: string;
}

export interface NanobotReadyEvent {
  nanobotPort: number;
  nanobotUrl: string;
  nanobotHealthy: boolean;
  nanobotVersion?: string;
  host: string;
  readyzPassed: boolean;
}

export interface StartupReadyEvent {
  nanobotPort: number;
  nanobotHealthy: boolean;
  nanobotVersion?: string;
  host: string;
  readyzPassed: boolean;
}

export interface StartupFailedEvent {
  code: string;
  message: string;
  i18nKey: string;
  logDir?: string;
}

export type StartupPhaseId =
  | "idle"
  | "first_run"
  | "spawning"
  | "healthz_ok"
  | "awaiting_readyz"
  | "ready"
  | "failed";

export interface StartupPhaseEvent {
  phase: StartupPhaseId;
  detail?: string;
}

export type TitleBarThemeMode = "light" | "dark";

export interface TitleBarThemePayload {
  mode: TitleBarThemeMode;
}

export interface StartupStateSnapshot {
  phase: "idle" | "starting" | "ready" | "failed";
  readyEvent?: StartupReadyEvent;
  failedEvent?: StartupFailedEvent;
}

export interface LogWriteRequest {
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogExportBundleRequest {
  format: "zip" | "txt";
}

export interface LogExportBundleResponse {
  filePath: string;
  sizeBytes: number;
}
