import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import { connectGoogleCalendarFromCode } from "@/lib/google-calendar-connect";

type Body = { code?: string };

export async function POST(request: Request) {
  const { error } = await withAdminAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Body | null;
  const code = body?.code?.trim();
  if (!code) return jsonError("Falta el código OAuth");

  try {
    const result = await connectGoogleCalendarFromCode(code);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar Google Calendar";
    return jsonError(message);
  }
}
