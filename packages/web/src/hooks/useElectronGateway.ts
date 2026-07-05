import { useEffect, useState } from "react";
import type { NanobotReadyEvent, StartupReadyEvent } from "@byclaw-nanobot/shared";
import { getElectronApi, isLikelyElectronShell } from "@/lib/electron-host";
import { setGatewayBaseUrl } from "@/lib/gateway-url";

export function useElectronGatewayUrl(): string | null {
  const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isLikelyElectronShell()) return;

    let cancelled = false;

    const apply = (host: string, port: number) => {
      if (cancelled) return;
      setGatewayBaseUrl(port, host);
      setGatewayUrl(`http://${host}:${port}`);
    };

    const attach = (): (() => void) | undefined => {
      const api = getElectronApi();
      if (!api) return undefined;

      void api.startup.getState().then((snapshot) => {
        const ready = snapshot.readyEvent;
        if (ready?.host && ready.nanobotPort) {
          apply(ready.host, ready.nanobotPort);
        }
      });

      const offNanobot = api.nanobot.onReady((payload) => {
        const event = payload as NanobotReadyEvent;
        if (event.host && event.nanobotPort) {
          apply(event.host, event.nanobotPort);
        }
      });

      const offStartup = api.startup.onReady((payload: StartupReadyEvent) => {
        if (payload.host && payload.nanobotPort) {
          apply(payload.host, payload.nanobotPort);
        }
      });

      return () => {
        offNanobot();
        offStartup();
      };
    };

    let cleanup: (() => void) | undefined = attach();
    if (cleanup) {
      const dispose = cleanup;
      return () => {
        cancelled = true;
        dispose();
      };
    }

    let attempts = 0;
    const poll = window.setInterval(() => {
      if (cancelled) return;
      attempts += 1;
      cleanup?.();
      cleanup = attach();
      if (cleanup || attempts >= 100) {
        window.clearInterval(poll);
      }
    }, 50);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      cleanup?.();
    };
  }, []);

  return gatewayUrl;
}
