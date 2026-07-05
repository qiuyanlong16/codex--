import type { TitleBarThemePayload } from "@byclaw-nanobot/shared";
import type { Theme } from "@/hooks/useTheme";

/** Page backgrounds that Windows titleBarOverlay must match exactly */
export const TITLE_BAR_SURFACES = {
  startupDark: "#0b0d12",
  startupLight: "#f8f9fb",
  light: "#ffffff",
  dark: "#1a1a1a",
} as const;

export function titleBarPayloadForStartup(theme: Theme): TitleBarThemePayload {
  return {
    mode: theme,
    surfaceColor:
      theme === "dark" ? TITLE_BAR_SURFACES.startupDark : TITLE_BAR_SURFACES.startupLight,
  };
}

export function titleBarPayloadForTheme(theme: Theme): TitleBarThemePayload {
  return {
    mode: theme,
    surfaceColor: theme === "dark" ? TITLE_BAR_SURFACES.dark : TITLE_BAR_SURFACES.light,
  };
}
