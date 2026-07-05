import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { StartupFailedEvent, StartupPhaseEvent } from "@byclaw-nanobot/shared";
import { getElectronApi, isLikelyElectronShell, type ElectronHostApi } from "@/lib/electron-host";
import { StartupShell } from "@/components/startup/StartupShell";

type NativeBootState =
  | { status: "loading" }
  | { status: "starting"; phase: StartupPhaseEvent["phase"] }
  | { status: "failed"; failed: StartupFailedEvent; phase: StartupPhaseEvent["phase"] }
  | { status: "ready" };

const PRELOAD_POLL_MS = 50;
const PRELOAD_POLL_MAX = 100;

function snapshotToState(snapshot: Awaited<ReturnType<ElectronHostApi["startup"]["getState"]>>): NativeBootState {
  if (snapshot.phase === "ready") {
    return { status: "ready" };
  }
  if (snapshot.phase === "failed" && snapshot.failedEvent) {
    return {
      status: "failed",
      failed: snapshot.failedEvent,
      phase: "failed",
    };
  }
  return { status: "starting", phase: "first_run" };
}

export function useNativeBootGate(): {
  blocking: boolean;
  shell: ReactNode | null;
  phase: StartupPhaseEvent["phase"];
  failed: StartupFailedEvent | null;
} {
  const [state, setState] = useState<NativeBootState>(() =>
    isLikelyElectronShell() ? { status: "loading" } : { status: "ready" },
  );

  const handleRetry = useCallback(() => {
    const api = getElectronApi();
    if (!api) return;
    setState({ status: "starting", phase: "first_run" });
    void api.app.retryStartup();
  }, []);

  useEffect(() => {
    if (!isLikelyElectronShell()) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let offPhase: (() => void) | undefined;
    let offReady: (() => void) | undefined;
    let offFailed: (() => void) | undefined;

    const attach = (api: ElectronHostApi) => {
      void api.startup.getState().then((snapshot) => {
        if (cancelled) return;
        setState(snapshotToState(snapshot));
      });

      offPhase = api.startup.onPhase((payload) => {
        setState((current) => {
          if (current.status === "ready") return current;
          if (current.status === "failed") return current;
          return { status: "starting", phase: payload.phase };
        });
      });

      offReady = api.startup.onReady(() => {
        setState({ status: "ready" });
      });

      offFailed = api.startup.onFailed((failed) => {
        setState({ status: "failed", failed, phase: "failed" });
      });
    };

    const api = getElectronApi();
    if (api) {
      attach(api);
    } else {
      let attempts = 0;
      pollTimer = setInterval(() => {
        if (cancelled) return;
        attempts += 1;
        const found = getElectronApi();
        if (found) {
          clearInterval(pollTimer);
          pollTimer = undefined;
          attach(found);
          return;
        }
        if (attempts >= PRELOAD_POLL_MAX) {
          clearInterval(pollTimer);
          pollTimer = undefined;
        }
      }, PRELOAD_POLL_MS);
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      offPhase?.();
      offReady?.();
      offFailed?.();
    };
  }, []);

  if (state.status === "loading") {
    return {
      blocking: true,
      shell: (
        <StartupShell
          phase="first_run"
          failed={null}
        />
      ),
      phase: "first_run",
      failed: null,
    };
  }

  if (state.status === "ready") {
    return { blocking: false, shell: null, phase: "ready", failed: null };
  }

  return {
    blocking: true,
    shell: (
      <StartupShell
        phase={state.phase}
        failed={state.status === "failed" ? state.failed : null}
        onRetry={handleRetry}
      />
    ),
    phase: state.phase,
    failed: state.status === "failed" ? state.failed : null,
  };
}
