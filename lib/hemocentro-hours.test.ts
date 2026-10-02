import { describe, expect, it } from "vitest";
import {
  buildBogotaSlot,
  currentHourBogota,
  formatTimeBogota,
  sitePhoneForMessages,
  startOfBogotaDay,
} from "./hemocentro-hours";

describe("formatTimeBogota", () => {
  it("muestra 03:00 p. m. para slot 15:00 Colombia aunque el instante sea 20:00 UTC", () => {
    const day = startOfBogotaDay(new Date("2026-10-02T12:00:00.000Z"));
    const slot = buildBogotaSlot(day, 15, 0);
    expect(slot.toISOString()).toBe("2026-10-02T20:00:00.000Z");
    expect(formatTimeBogota(slot)).toMatch(/03:00\s*p\.?\s*m\.?/i);
  });
});

describe("currentHourBogota", () => {
  it("devuelve 9 cuando en UTC son las 14:00 (Colombia UTC-5)", () => {
    expect(currentHourBogota(new Date("2026-10-02T14:00:00.000Z"))).toBe(9);
  });
});

describe("sitePhoneForMessages", () => {
  it("reemplaza el teléfono antiguo de la sede", () => {
    expect(sitePhoneForMessages("(605) 5732706")).toBe("3182616448");
    expect(sitePhoneForMessages("3182616448")).toBe("3182616448");
  });
});
