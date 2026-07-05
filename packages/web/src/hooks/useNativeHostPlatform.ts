import { useEffect, useState } from "react";

import { getElectronApi } from "@/lib/electron-host";

export type NativeHostPlatform = "darwin" | "win32" | "linux" | string;

function readNavigatorPlatformHint(): NativeHostPlatform | null {
  if (typeof navigator === "undefined") return null;
  const platform = navigator.platform || "";
  const userAgentPlatform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform || "";
  const combined = `${platform} ${userAgentPlatform}`.toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(combined)) return "darwin";
  if (/win/.test(combined)) return "win32";
  if (/linux|android/.test(combined)) return "linux";
  return null;
}

/** Electron shell platform from preload (`app.getInfo`), with a navigator hint for first paint. */
export function useNativeHostPlatform(): NativeHostPlatform | null {
  const [platform, setPlatform] = useState<NativeHostPlatform | null>(readNavigatorPlatformHint);

  useEffect(() => {
    const api = getElectronApi();
    if (!api) return;
    let cancelled = false;
    void api.app.getInfo().then((info) => {
      if (!cancelled && info.platform) {
        setPlatform(info.platform);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return platform;
}

export function isMacNativeHost(
  showHostChrome: boolean,
  platform: NativeHostPlatform | null,
): boolean {
  return showHostChrome && platform === "darwin";
}
