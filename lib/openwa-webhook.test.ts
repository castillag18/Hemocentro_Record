import { describe, expect, it } from "vitest";
import { extractOpenWaWebhookMessage } from "./openwa-webhook";

describe("extractOpenWaWebhookMessage", () => {
  it("extrae senderPhone en mensajes @lid", () => {
    const parsed = extractOpenWaWebhookMessage({
      event: "message.received",
      data: {
        from: "123456789@lid",
        chatId: "123456789@lid",
        body: "Si",
        senderPhone: "573042478186",
        type: "text",
      },
    });
    expect(parsed.senderPhone).toBe("573042478186");
    expect(parsed.body).toBe("Si");
    expect(parsed.chatId).toBe("123456789@lid");
  });

  it("usa selectedButtonId cuando body está vacío", () => {
    const parsed = extractOpenWaWebhookMessage({
      event: "message.received",
      data: {
        from: "573001234567@c.us",
        body: "",
        selectedButtonId: "Si",
        type: "buttons_response",
      },
    });
    expect(parsed.body).toBe("Si");
  });
});
