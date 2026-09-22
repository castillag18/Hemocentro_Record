const { PrismaClient } = require("@prisma/client");

async function sessionStatus(base, key, sessionId) {
  const headers = { "Content-Type": "application/json", "X-API-Key": key };
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let uuid = sessionId;
  if (!UUID_RE.test(sessionId)) {
    const list = await fetch(`${base}/api/sessions`, { headers }).then((r) => r.json());
    const name = sessionId.trim() || "default";
    const found = Array.isArray(list) ? list.find((s) => s.name === name) : null;
    if (found?.id) uuid = found.id;
    else {
      const create = await fetch(`${base}/api/sessions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name }),
      }).then((r) => r.json());
      uuid = create.id;
    }
  }

  const res = await fetch(`${base}/api/sessions/${encodeURIComponent(uuid)}`, { headers });
  const data = await res.json();
  return { uuid, status: data.status ?? data.state, httpStatus: res.status };
}

async function main() {
  const p = new PrismaClient();
  const s = await p.settings.findUnique({ where: { id: "default" } });
  const base = s.whatsappOpenWaUrl.replace(/\/$/, "");
  const key = s.whatsappOpenWaApiKey;

  for (const sid of [s.whatsappOpenWaSessionId, "hemocentro", "default"]) {
    const result = await sessionStatus(base, key, sid);
    console.log(JSON.stringify({ input: sid?.slice?.(0, 12) ?? sid, ...result }));
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
