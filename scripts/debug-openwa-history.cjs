const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const base = settings.whatsappOpenWaUrl.replace(/\/$/, "");
  const uuid = settings.whatsappOpenWaSessionId;
  const key = settings.whatsappOpenWaApiKey;
  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  const chatId = "573042478186@c.us";
  const text = "test history " + Date.now();

  const send = await fetch(`${base}/api/sessions/${uuid}/messages/send-text`, {
    method: "POST",
    headers,
    body: JSON.stringify({ chatId, text }),
  });
  console.log("send", send.status, await send.text());

  await new Promise((r) => setTimeout(r, 2000));

  const history = await fetch(`${base}/api/sessions/${uuid}/messages?limit=5`, { headers });
  console.log("history", history.status, (await history.text()).slice(0, 800));

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
