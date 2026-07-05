import type { Theme } from "@/hooks/useTheme";
import { useThemeValue } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

type HostBrandMarkProps = {
  className?: string;
  /** Title bar vs startup shell background */
  surface?: "chrome" | "startup";
  theme?: Theme;
};

const ACCENT = {
  chrome: {
    light: {
      mark: "from-sky-500/90 to-cyan-500/75",
      suffix: "text-sky-600/90",
      word: "text-foreground/88",
    },
    dark: {
      mark: "from-cyan-400/85 to-sky-400/55",
      suffix: "text-cyan-300/80",
      word: "text-foreground/90",
    },
  },
  startup: {
    light: {
      mark: "from-sky-600 to-cyan-500",
      suffix: "text-sky-700",
      word: "text-slate-800",
    },
    dark: {
      mark: "from-cyan-300/90 to-sky-400/60",
      suffix: "text-cyan-300/85",
      word: "text-[#eef2f8]",
    },
  },
} as const;

export function HostBrandMark({
  className,
  surface = "chrome",
  theme: themeProp,
}: HostBrandMarkProps) {
  const contextTheme = useThemeValue();
  const theme = themeProp ?? contextTheme;
  const palette = ACCENT[surface][theme];

  return (
    <span
      className={cn(
        "host-drag-region pointer-events-none inline-flex items-center gap-[7px] select-none",
        className,
      )}
      aria-hidden
    >
      <span
        className={cn(
          "h-[14px] w-[2.5px] shrink-0 rounded-full bg-gradient-to-b opacity-90",
          palette.mark,
        )}
      />
      <span className="flex items-baseline gap-px text-[13px] leading-none tracking-[-0.04em]">
        <span className={cn("font-semibold", palette.word)}>Codex</span>
        <span className={cn("font-medium tabular-nums", palette.suffix)}>--</span>
      </span>
    </span>
  );
}
