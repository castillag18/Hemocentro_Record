const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const base = settings.whatsappOpenWaUrl.replace(/\/$/, "");
  const uuid = settings.whatsappOpenWaSessionId;
  const key = settings.whatsappOpenWaApiKey;
  const phone = "573042478186";
  const chatId = `${phone}@c.us`;

  for (const body of [
    { chatId, text: "test1 " + Date.now() },
    { chatId, text: "test2 " + Date.now(), linkPreview: false },
  ]) {
    const res = await fetch(`${base}/api/sessions/${uuid}/messages/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log("payload", JSON.stringify(body), "->", res.status, text.slice(0, 300));
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
