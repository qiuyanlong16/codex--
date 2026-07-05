import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { StartupFailedEvent, StartupPhaseEvent } from "@byclaw-nanobot/shared";
import { getElectronApi } from "@/lib/electron-host";
import { StartupShell } from "@/components/startup/StartupShell";

type NativeBootState =
  | { status: "loading" }
  | { status: "starting"; phase: StartupPhaseEvent["phase"] }
  | { status: "failed"; failed: StartupFailedEvent; phase: StartupPhaseEvent["phase"] }
  | { status: "ready" };

export function useNativeBootGate(): {
  blocking: boolean;
  shell: ReactNode | null;
} {
  const [state, setState] = useState<NativeBootState>(() =>
    getElectronApi() ? { status: "loading" } : { status: "ready" },
  );

  const handleRetry = useCallback(() => {
    const api = getElectronApi();
    if (!api) return;
    setState({ status: "starting", phase: "first_run" });
    void api.app.retryStartup();
  }, []);

  useEffect(() => {
    const api = getElectronApi();
    if (!api) return;

    let cancelled = false;

    void api.startup.getState().then((snapshot) => {
      if (cancelled) return;
      if (snapshot.phase === "ready") {
        setState({ status: "ready" });
        return;
      }
      if (snapshot.phase === "failed" && snapshot.failedEvent) {
        setState({
          status: "failed",
          failed: snapshot.failedEvent,
          phase: "failed",
        });
        return;
      }
      setState({ status: "starting", phase: "first_run" });
    });

    const offPhase = api.startup.onPhase((payload) => {
      setState((current) => {
        if (current.status === "ready") return current;
        if (current.status === "failed") return current;
        return { status: "starting", phase: payload.phase };
      });
    });

    const offReady = api.startup.onReady(() => {
      setState({ status: "ready" });
    });

    const offFailed = api.startup.onFailed((failed) => {
      setState({ status: "failed", failed, phase: "failed" });
    });

    return () => {
      cancelled = true;
      offPhase();
      offReady();
      offFailed();
    };
  }, []);

  if (state.status === "ready" || state.status === "loading") {
    return { blocking: state.status === "loading", shell: null };
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
  };
}
