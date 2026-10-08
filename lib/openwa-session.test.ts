import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal("fetch", mockFetch);

import {
  clearOpenWaSessionUuidCache,
  isOpenWaSessionUuid,
  normalizeOpenWaSessionName,
  resolveOpenWaSessionUuid,
} from "./openwa-session";

const STALE_UUID = "1e04954c-6722-487e-b418-44f563a925cd";
const LIVE_UUID = "1670d990-9b7d-4d9c-8aa3-00dcdec66691";
const opts = {
  baseUrl: "http://localhost:2785",
  apiKey: "test-key",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("resolveOpenWaSessionUuid", () => {
  beforeEach(() => {
    clearOpenWaSessionUuidCache();
    process.env.OPENWA_MIN_INTERVAL_MS = "0";
    mockFetch.mockReset();
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse({})));
  });

  it("reutiliza UUID válido existente", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ id: LIVE_UUID, name: "default" })),
    );

    const uuid = await resolveOpenWaSessionUuid({
      ...opts,
      sessionId: LIVE_UUID,
    });

    expect(uuid).toBe(LIVE_UUID);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("recupera sesión por nombre cuando el UUID guardado ya no existe", async () => {
    let apiCall = 0;
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      apiCall += 1;
      if (apiCall === 1) return Promise.resolve(jsonResponse({ message: "not found" }, 404));
      if (apiCall === 2) return Promise.resolve(jsonResponse([]));
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ id: "new-session-uuid", name: "default" }, 201));
      }
      return Promise.resolve(jsonResponse([]));
    });

    const uuid = await resolveOpenWaSessionUuid({
      ...opts,
      sessionId: STALE_UUID,
    });

    expect(uuid).toBe("new-session-uuid");
    expect(mockFetch.mock.calls[0][0]).toContain(STALE_UUID);
    expect(mockFetch.mock.calls[1][0]).toContain("/api/sessions");
    expect(mockFetch.mock.calls[2][1]?.method).toBe("POST");
  });

  it("encuentra sesión existente por nombre default", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse([{ id: LIVE_UUID, name: "default" }])),
    );

    const uuid = await resolveOpenWaSessionUuid({
      ...opts,
      sessionId: "default",
    });

    expect(uuid).toBe(LIVE_UUID);
  });
});

describe("normalizeOpenWaSessionName", () => {
  it("convierte UUID almacenado erróneamente a default", () => {
    expect(normalizeOpenWaSessionName(STALE_UUID)).toBe("default");
  });

  it("conserva nombre de sesión legítimo", () => {
    expect(normalizeOpenWaSessionName("hemocentro")).toBe("hemocentro");
  });
});

describe("isOpenWaSessionUuid", () => {
  it("detecta UUID v4", () => {
    expect(isOpenWaSessionUuid(STALE_UUID)).toBe(true);
    expect(isOpenWaSessionUuid("default")).toBe(false);
  });
});
