import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveBootstrapBaseUrl } from "@/lib/gateway-url";

describe("resolveBootstrapBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
