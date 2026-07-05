import type { TitleBarThemePayload } from "@byclaw-nanobot/shared";
import type { Theme } from "@/hooks/useTheme";

/** Page backgrounds that Windows titleBarOverlay must match exactly */
export const TITLE_BAR_SURFACES = {
  startup: "#0b0d12",
  light: "#ffffff",
  dark: "#1a1a1a",
} as const;

export const STARTUP_TITLE_BAR: TitleBarThemePayload = {
  mode: "dark",
  surfaceColor: TITLE_BAR_SURFACES.startup,
};

export function titleBarPayloadForTheme(theme: Theme): TitleBarThemePayload {
  return {
    mode: theme,
    surfaceColor: theme === "dark" ? TITLE_BAR_SURFACES.dark : TITLE_BAR_SURFACES.light,
  };
}
