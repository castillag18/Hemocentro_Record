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
    // #region agent log
    fetch("http://127.0.0.1:7337/ingest/480d9457-0d84-4217-82dc-239d47e97655", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "dc40f8" },
      body: JSON.stringify({
        sessionId: "dc40f8",
        runId: "calendar-connect",
        hypothesisId: "H8-code-connect",
        location: "google-calendar/connect:POST",
        message: "Calendar conectado vía código",
        data: {
          email: result.email,
          synced: result.synced,
          hadNewRefreshToken: result.hadNewRefreshToken,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo conectar Google Calendar";
    // #region agent log
    fetch("http://127.0.0.1:7337/ingest/480d9457-0d84-4217-82dc-239d47e97655", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "dc40f8" },
      body: JSON.stringify({
        sessionId: "dc40f8",
        runId: "calendar-connect",
        hypothesisId: "H8-code-connect-fail",
        location: "google-calendar/connect:POST",
        message: "Fallo conexión Calendar",
        data: { error: message },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return jsonError(message);
  }
}
