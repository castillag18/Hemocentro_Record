import { describe, expect, it } from "vitest";
import { donorPhoneDigitsMatch } from "./openwa-contacts";

describe("donorPhoneDigitsMatch", () => {
  it("no coincide con un solo dígito (evita donante PRUEBA con teléfono …0)", () => {
    expect(donorPhoneDigitsMatch("5730000000000", "0")).toBe(false);
    expect(donorPhoneDigitsMatch("5730000000003", "3")).toBe(false);
  });

  it("coincide por número completo o últimos 10 dígitos", () => {
    expect(donorPhoneDigitsMatch("573042478186", "573042478186")).toBe(true);
    expect(donorPhoneDigitsMatch("3042478186", "573042478186")).toBe(true);
    expect(donorPhoneDigitsMatch("573042478186", "3042478186")).toBe(true);
  });

  it("no coincide números distintos", () => {
    expect(donorPhoneDigitsMatch("573042478186", "573017728601")).toBe(false);
  });
});
