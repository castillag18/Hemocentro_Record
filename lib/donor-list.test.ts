import { describe, expect, it } from "vitest";
import { buildDonorSearchWhere } from "./donor-list";

describe("buildDonorSearchWhere", () => {
  it("exige al menos 2 caracteres", () => {
    const w = buildDonorSearchWhere("a", "");
    expect(JSON.stringify(w)).toContain('"in":[]');
  });

  it("prioriza cédula numérica", () => {
    const w = buildDonorSearchWhere("1234567890", "");
    expect(JSON.stringify(w)).toContain("documentId");
  });
});
