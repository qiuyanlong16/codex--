import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, FolderOpen, RotateCcw } from "lucide-react";
import type { StartupFailedEvent, StartupPhaseEvent } from "@byclaw-nanobot/shared";
import { Button } from "@/components/ui/button";
import { getElectronApi } from "@/lib/electron-host";
import { cn } from "@/lib/utils";

const PHASE_ORDER: StartupPhaseEvent["phase"][] = [
  "first_run",
  "spawning",
  "healthz_ok",
  "awaiting_readyz",
  "ready",
];

function phaseIndex(phase: StartupPhaseEvent["phase"]): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

type StartupShellProps = {
  phase: StartupPhaseEvent["phase"];
  failed: StartupFailedEvent | null;
  onRetry?: () => void;
};

export function StartupShell({ phase, failed, onRetry }: StartupShellProps) {
  const { t } = useTranslation();
  const tx = (key: string, fallback: string) => t(key, { defaultValue: fallback });
  const [pulse, setPulse] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setPulse((v) => v + 1), 2400);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const activeIndex = useMemo(() => phaseIndex(failed ? "failed" : phase), [failed, phase]);
  const isGatewayError = failed?.i18nKey === "startup.gatewayError";

  const steps = [
    { id: "first_run", label: tx("startup.phases.firstRun", "Preparing environment") },
    { id: "spawning", label: tx("startup.phases.spawning", "Starting gateway") },
    { id: "healthz_ok", label: tx("startup.phases.healthz", "Health check") },
    { id: "awaiting_readyz", label: tx("startup.phases.readyz", "Loading tools & models") },
    { id: "ready", label: tx("startup.phases.ready", "Connecting") },
  ] as const;

  const openLogs = () => {
    const api = getElectronApi();
    if (failed?.logDir && api?.app.openExternal) {
      void api.app.openExternal(`file:///${failed.logDir.replace(/\\/g, "/")}`);
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0b0d12] text-[#e8ecf4]">
      <div className="host-drag-region absolute inset-x-0 top-0 z-50 h-11" aria-hidden />

      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 90% 55% at 50% -15%, rgba(0, 212, 255, 0.16), transparent 58%), radial-gradient(ellipse 55% 45% at 100% 100%, rgba(0, 96, 160, 0.1), transparent 52%), linear-gradient(180deg, #0d1018 0%, #0b0d12 45%, #090b10 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div
        className={cn(
          "relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-14 transition-all duration-700 ease-out",
          revealed ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <div
          className="mb-8 flex h-[92px] w-[92px] items-center justify-center rounded-[24px] ring-1 ring-cyan-400/20 shadow-[0_0_56px_rgba(0,212,255,0.24)]"
          style={{
            animation: failed ? undefined : `startup-breathe 3.2s ease-in-out infinite`,
          }}
        >
          <img
            src="./brand/nanobot_icon.png"
            alt=""
            className="h-[92px] w-[92px] rounded-[24px] select-none"
            draggable={false}
          />
        </div>

        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-300/55">
          codex--
        </p>
        <h1 className="mb-2 text-[24px] font-medium tracking-[-0.03em] text-[#f3f6fb]">
          {failed
            ? tx("startup.failed.title", "Could not start codex--")
            : tx("startup.booting.title", "Starting codex--")}
        </h1>
        <p className="mb-10 max-w-md text-center text-[13px] leading-relaxed text-[#8b95a8]">
          {failed
            ? isGatewayError
              ? tx(
                  "startup.failed.gatewayHint",
                  "The gateway is running but the UI could not connect. Check logs and retry.",
                )
              : tx("startup.failed.hint", "Check your model provider configuration and logs, then retry.")
            : tx("startup.booting.hint", "Setting up your local AI agent. This usually takes a few seconds.")}
        </p>

        {failed ? (
          <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-950/35 to-red-950/15 px-4 py-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-red-100">
                  {isGatewayError
                    ? tx("startup.failed.gatewayError", "Connection error")
                    : tx("startup.failed.error", "Startup error")}
                </p>
                <p className="mt-1.5 break-all font-mono text-[12px] leading-relaxed text-red-300/90">
                  {failed.message || failed.code}
                </p>
                {failed.logDir ? (
                  <p className="mt-2 text-[11px] text-red-300/65">
                    {tx("startup.failed.logDir", "Logs")}: {failed.logDir}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {onRetry ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="host-no-drag rounded-full border-red-400/30 bg-transparent text-red-100 hover:bg-red-900/40"
                  onClick={onRetry}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {tx("startup.failed.retry", "Retry")}
                </Button>
              ) : null}
              {failed.logDir ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="host-no-drag rounded-full text-red-200/90 hover:bg-red-900/30"
                  onClick={openLogs}
                >
                  <FolderOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  {tx("startup.failed.openLogs", "Open logs folder")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <ol className="w-full max-w-sm space-y-1.5">
            {steps.map((step, index) => {
              const done = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li
                  key={step.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-500",
                    active && "bg-cyan-500/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                    done && "opacity-50",
                  )}
                  style={{
                    transitionDelay: `${index * 60}ms`,
                    opacity: done ? 0.5 : active ? 1 : 0.32,
                  }}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                      done && "bg-cyan-500/20 text-cyan-300",
                      active && "bg-cyan-400/25 text-cyan-100 ring-1 ring-cyan-400/40",
                      !done && !active && "bg-white/5 text-[#6b7280]",
                    )}
                  >
                    {done ? "✓" : index + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[13px]",
                      active ? "font-medium text-cyan-100" : "text-[#9ca3af]",
                    )}
                  >
                    {step.label}
                    {active && !failed ? (
                      <span
                        key={pulse}
                        className="ml-1 inline-block animate-pulse text-cyan-400/80"
                      >
                        …
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="relative z-10 px-8 pb-6">
        <div className="mx-auto h-1 max-w-lg overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-600/70 via-cyan-300 to-cyan-500/80 transition-all duration-700 ease-out"
            style={{
              width: failed ? "100%" : `${Math.min(100, ((activeIndex + 1) / steps.length) * 100)}%`,
              opacity: failed ? 0.35 : 1,
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes startup-breathe {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.035); filter: brightness(1.1); }
        }
      `}</style>
    </div>
  );
}
