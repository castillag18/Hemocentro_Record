import { NextResponse } from "next/server";
import { importDonorsFromHuav } from "@/lib/import-donors-huav";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET ?? "hemocentro-cron-dev";
  if (secret !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const full = url.searchParams.get("full") === "1";

  try {
    const result = await importDonorsFromHuav({ mode: full ? "full" : "incremental" });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Importación HUAV fallida";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
