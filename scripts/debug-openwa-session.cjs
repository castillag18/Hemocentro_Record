const { PrismaClient } = require("@prisma/client");

async function main() {
  const p = new PrismaClient();
  const settings = await p.settings.findUnique({ where: { id: "default" } });
  const base = settings.whatsappOpenWaUrl.replace(/\/$/, "");
  const uuid = settings.whatsappOpenWaSessionId;
  const key = settings.whatsappOpenWaApiKey;
  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  const phone = "573042478186";

  const session = await fetch(`${base}/api/sessions/${uuid}`, { headers }).then((r) => r.json());
  console.log("session", session.status, session.phone, session.pushName);

  const check = await fetch(`${base}/api/sessions/${uuid}/contacts/check/${phone}`, { headers });
  console.log("check", check.status, await check.text());

  const chats = await fetch(`${base}/api/sessions/${uuid}/chats?limit=5`, { headers });
  console.log("chats", chats.status, (await chats.text()).slice(0, 400));

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
