import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveWsUrl, fetchBootstrap, isTransientBootstrapError, resolveBootstrapFetchUrl } from "@/lib/bootstrap";
import { clearGatewayBaseUrl, setGatewayBaseUrl } from "@/lib/gateway-url";

describe("bootstrap helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearGatewayBaseUrl();
  });

  it("never uses file:///C:/webui/bootstrap on packaged file:// pages", () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:", port: "", origin: "null", host: "" },
    });
    expect(() => resolveBootstrapFetchUrl("")).toThrow("gateway URL not ready");
    setGatewayBaseUrl(8766);
    expect(resolveBootstrapFetchUrl("")).toBe("http://127.0.0.1:8766/webui/bootstrap");
  });

  it("uses the Vite dev proxy path on port 5173", () => {
    vi.stubGlobal("window", {
      location: { protocol: "http:", port: "5173", origin: "http://127.0.0.1:5173", host: "127.0.0.1:5173" },
    });
    expect(resolveBootstrapFetchUrl("")).toBe("/webui/bootstrap");
  });

  it("routes websocket through gateway host on file:// packaged shell", () => {
    setGatewayBaseUrl(8766);
    vi.stubGlobal("window", {
      location: { protocol: "file:", port: "", host: "", origin: "null" },
    });
    expect(deriveWsUrl("/ws", "tok")).toBe("ws://127.0.0.1:8766/ws?token=tok");
  });

  it("prefers the server-provided websocket URL over the current dev host", () => {
    expect(deriveWsUrl("/", "tok en", "ws://127.0.0.1:8765/")).toBe(
      "ws://127.0.0.1:8765/?token=tok%20en",
    );
  });

  it("overrides the server-provided websocket URL when on dev server port 5173", () => {
    vi.stubGlobal("window", {
      location: {
        port: "5173",
        hostname: "192.168.1.100",
        protocol: "http:",
      },
    });
    expect(deriveWsUrl("/", "tok", "ws://127.0.0.1:8765/")).toBe(
      "ws://192.168.1.100:8765/?token=tok",
    );
  });

  it("preserves the host socket bridge URL", () => {
    expect(deriveWsUrl("/", "tok en", "nanobot-host://engine/")).toBe(
      "nanobot-host://engine/?token=tok%20en",
    );
  });

  it("falls back to the current window host for legacy bootstrap payloads", () => {
    expect(deriveWsUrl("/", "tok")).toBe(
      "ws://localhost:3000/?token=tok",
    );
  });

  it("times out when the bootstrap endpoint never responds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));

    const pending = expect(fetchBootstrap("", "", 25)).rejects.toThrow(
      "Request timed out after 25ms",
    );
    await vi.advanceTimersByTimeAsync(25);

    await pending;
  });

  it("treats gateway network failures as transient during shell startup", () => {
    expect(isTransientBootstrapError("Failed to fetch")).toBe(true);
    expect(isTransientBootstrapError("Request timed out after 5000ms")).toBe(true);
    expect(isTransientBootstrapError("bootstrap failed: HTTP 503")).toBe(true);
    expect(isTransientBootstrapError("bootstrap failed: HTTP 401")).toBe(false);
  });
});
