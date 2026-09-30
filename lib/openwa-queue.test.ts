import { describe, expect, it } from "vitest";
import { isOpenWaThrottleMessage } from "./openwa-queue";

describe("openwa-queue", () => {
  it("detecta ThrottlerException", () => {
    expect(isOpenWaThrottleMessage("ThrottlerException: Too Many Requests", 429)).toBe(true);
    expect(isOpenWaThrottleMessage("ok", 200)).toBe(false);
  });
});
