import { NextResponse } from "next/server";
import { pollOpenWaInbox } from "@/lib/openwa-inbox-poll";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET ?? "hemocentro-cron-dev";
  if (secret !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const result = await pollOpenWaInbox();
  return NextResponse.json({ ok: true, ...result });
}
