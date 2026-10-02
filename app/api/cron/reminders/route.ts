import { NextResponse } from "next/server";
import { runAutoRemindersJob } from "@/lib/cron-reminders";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET ?? "hemocentro-cron-dev";
  if (secret !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const summary = await runAutoRemindersJob({ force });
  return NextResponse.json(summary);
}
