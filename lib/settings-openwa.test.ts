import { describe, expect, it, afterEach } from "vitest";
import { resolveOpenWaBaseUrl } from "./settings";

describe("resolveOpenWaBaseUrl", () => {
  const prev = process.env.WHATSAPP_OPENWA_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.WHATSAPP_OPENWA_URL;
    else process.env.WHATSAPP_OPENWA_URL = prev;
  });

  it("convierte localhost a 127.0.0.1", () => {
    delete process.env.WHATSAPP_OPENWA_URL;
    expect(resolveOpenWaBaseUrl("http://localhost:2785")).toBe("http://127.0.0.1:2785");
  });

  it("prioriza WHATSAPP_OPENWA_URL del entorno", () => {
    process.env.WHATSAPP_OPENWA_URL = "http://127.0.0.1:2785";
    expect(resolveOpenWaBaseUrl("http://192.168.1.99:2785")).toBe("http://127.0.0.1:2785");
  });
});
