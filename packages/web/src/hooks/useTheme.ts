import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { TitleBarThemePayload } from "@byclaw-nanobot/shared";
import { getElectronApi } from "@/lib/electron-host";
import { titleBarPayloadForTheme } from "@/lib/title-bar";

export type Theme = "light" | "dark";
const STORAGE_KEY = "nanobot-webui.theme";
const PRELOAD_POLL_MS = 50;
const PRELOAD_POLL_MAX = 100;
const ThemeContext = createContext<Theme>("light");

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function readInitialTheme(): Theme {
  const stored = readStored();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

export function applyDocumentTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

/** Keep retrying until preload exposes setTitleBarTheme (gateway reload race). */
export function syncNativeTitleBarWithRetry(payload: TitleBarThemePayload): () => void {
  let cancelled = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const sync = (): boolean => {
    const api = getElectronApi();
    if (!api?.app.setTitleBarTheme) return false;
    void api.app.setTitleBarTheme(payload);
    return true;
  };

  if (!sync()) {
    let attempts = 0;
    pollTimer = setInterval(() => {
      if (cancelled) return;
      if (sync() || ++attempts >= PRELOAD_POLL_MAX) {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = undefined;
      }
    }, PRELOAD_POLL_MS);
  }

  return () => {
    cancelled = true;
    if (pollTimer) clearInterval(pollTimer);
  };
}

export function useTheme(): {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    applyDocumentTheme(theme);
    const stopTitleBarSync = syncNativeTitleBarWithRetry(titleBarPayloadForTheme(theme));
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
    return stopTitleBarSync;
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  return { theme, toggle, setTheme };
}

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useThemeValue(): Theme {
  return useContext(ThemeContext);
}
