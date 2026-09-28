import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import { agentDebugLog } from "@/lib/debug-log";
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
    // #region agent log
    agentDebugLog({
      location: "google-calendar/connect:POST",
      message: "Manual OAuth connect succeeded",
      data: { email: result.email, synced: result.synced, failed: result.failed },
      hypothesisId: "H8",
      runId: "post-fix",
    });
    // #endregion
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar Google Calendar";
    // #region agent log
    agentDebugLog({
      location: "google-calendar/connect:POST",
      message: "Manual OAuth connect failed",
      data: { error: message },
      hypothesisId: "H8",
      runId: "post-fix",
    });
    // #endregion
    return jsonError(message);
  }
}
