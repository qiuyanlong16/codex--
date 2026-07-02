import type { StartupReadyEvent, StartupFailedEvent } from "@byclaw-nanobot/shared";

export type StartupPhase = "idle" | "starting" | "ready" | "failed";

export type StartupReadySnapshot = StartupReadyEvent;
export type StartupFailedSnapshot = StartupFailedEvent;

export interface StartupState {
  phase: StartupPhase;
  readyEvent?: StartupReadySnapshot;
  failedEvent?: StartupFailedSnapshot;
}

let currentState: StartupState = { phase: "idle" };

export function getStartupState(): StartupState {
  return { ...currentState };
}

export function markStartupReady(event: StartupReadySnapshot): void {
  currentState = { phase: "ready", readyEvent: event };
}

export function markStartupFailed(event: StartupFailedSnapshot): void {
  currentState = { phase: "failed", failedEvent: event };
}

export function resetStartupSnapshot(): void {
  currentState = { phase: "idle" };
}
