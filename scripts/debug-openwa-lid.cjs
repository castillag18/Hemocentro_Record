const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const base = settings.whatsappOpenWaUrl.replace(/\/$/, "");
  const uuid = settings.whatsappOpenWaSessionId;
  const key = settings.whatsappOpenWaApiKey;
  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  const phone = "573042478186";

  const check = await fetch(`${base}/api/sessions/${uuid}/contacts/check/${phone}`, { headers }).then((r) =>
    r.json(),
  );
  console.log("check", check);

  for (const chatId of [check.whatsappId, `${phone}@c.us`]) {
    const res = await fetch(`${base}/api/sessions/${uuid}/messages/send-text`, {
      method: "POST",
      headers,
      body: JSON.stringify({ chatId, text: "test lid " + Date.now() }),
    });
    console.log("send to", chatId, "->", res.status, await res.text());
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
