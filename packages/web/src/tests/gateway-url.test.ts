import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearGatewayBaseUrl,
  resolveApiBaseUrl,
  resolveBootstrapBaseUrl,
  resolveGatewayHttpUrl,
  setGatewayBaseUrl,
} from "@/lib/gateway-url";

describe("resolveBootstrapBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearGatewayBaseUrl();
  });

  it("uses Vite proxy on local dev port 5173", () => {
    vi.stubGlobal("window", {
      location: { port: "5173", protocol: "http:", host: "127.0.0.1:5173" },
    });
    expect(resolveBootstrapBaseUrl("http://127.0.0.1:8766")).toBe("");
  });

  it("hits gateway directly from packaged file origin", () => {
    vi.stubGlobal("window", {
      location: { port: "", protocol: "file:", host: "" },
    });
    expect(resolveBootstrapBaseUrl("http://127.0.0.1:8766")).toBe(
      "http://127.0.0.1:8766",
    );
  });
});

describe("resolveApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearGatewayBaseUrl();
  });

  it("uses Vite proxy on port 5173", () => {
    vi.stubGlobal("window", {
      location: { port: "5173", protocol: "http:", host: "127.0.0.1:5173" },
    });
    expect(resolveApiBaseUrl()).toBe("");
  });

  it("uses gateway URL on packaged file:// shell", () => {
    vi.stubGlobal("window", {
      location: { port: "", protocol: "file:", host: "" },
    });
    setGatewayBaseUrl(8766);
    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:8766");
  });

  it("falls back to default gateway port on file:// before IPC", () => {
    vi.stubGlobal("window", {
      location: { port: "", protocol: "file:", host: "" },
    });
    expect(resolveApiBaseUrl()).toBe("http://127.0.0.1:8766");
  });
});

describe("resolveGatewayHttpUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearGatewayBaseUrl();
  });

  it("rewrites /api paths for packaged file:// shell", () => {
    vi.stubGlobal("window", {
      location: { port: "", protocol: "file:", host: "" },
    });
    setGatewayBaseUrl(8766);
    expect(resolveGatewayHttpUrl("/api/settings")).toBe(
      "http://127.0.0.1:8766/api/settings",
    );
  });

  it("keeps /api paths relative on Vite dev server", () => {
    vi.stubGlobal("window", {
      location: { port: "5173", protocol: "http:", host: "127.0.0.1:5173" },
    });
    expect(resolveGatewayHttpUrl("/api/settings")).toBe("/api/settings");
  });

  it("rewrites /brand assets to relative paths on file://", () => {
    vi.stubGlobal("window", {
      location: { port: "", protocol: "file:", host: "" },
    });
    expect(resolveGatewayHttpUrl("/brand/nanobot_icon.png")).toBe(
      "./brand/nanobot_icon.png",
    );
  });
});
