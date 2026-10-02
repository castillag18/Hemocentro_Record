import { describe, expect, it } from "vitest";
import type { Donor } from "@prisma/client";
import { huavDonorRecordChanged, type HuavDonorPayload } from "./import-donors-huav";

function baseDonor(overrides: Partial<Donor> = {}): Donor {
  return {
    id: "d1",
    name: "JUAN PEREZ",
    documentId: "123",
    bloodType: "O+",
    gender: "M",
    donationType: "total",
    birthDate: new Date("1990-01-15T05:00:00.000Z"),
    lastDonationDate: new Date("2026-01-10T05:00:00.000Z"),
    phone: "573001234567",
    whatsappChatId: null,
    email: "juan@example.com",
    preferredChannel: "ambos",
    accepted: true,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function basePayload(overrides: Partial<HuavDonorPayload> = {}): HuavDonorPayload {
  return {
    name: "JUAN PEREZ",
    documentId: "123",
    bloodType: "O+",
    gender: "M",
    donationType: "total",
    birthDate: new Date("1990-01-15T05:00:00.000Z"),
    lastDonationDate: new Date("2026-01-10T05:00:00.000Z"),
    phone: "573001234567",
    email: "juan@example.com",
    preferredChannel: "ambos",
    accepted: true,
    active: true,
    ...overrides,
  };
}

describe("huavDonorRecordChanged", () => {
  it("false cuando los datos coinciden", () => {
    expect(huavDonorRecordChanged(baseDonor(), basePayload())).toBe(false);
  });

  it("true cuando cambia la última donación", () => {
    expect(
      huavDonorRecordChanged(
        baseDonor(),
        basePayload({ lastDonationDate: new Date("2026-02-01T05:00:00.000Z") }),
      ),
    ).toBe(true);
  });

  it("true cuando cambia el teléfono", () => {
    expect(
      huavDonorRecordChanged(baseDonor(), basePayload({ phone: "573099999999" })),
    ).toBe(true);
  });
});
