import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/constants";
import { usesSecureCookies } from "@/lib/cookie-secure";
import { agentDebugLog } from "@/lib/debug-log";
import { jsonError } from "@/lib/api";
import { loginWithGoogleCode } from "@/lib/google-login-from-code";

type Body = { code?: string; mode?: "login" | "calendar" };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  const code = body?.code?.trim();
  if (!code) return jsonError("Falta el código OAuth");

  try {
    const result = await loginWithGoogleCode(code);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: usesSecureCookies(),
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    // #region agent log
    agentDebugLog({
      location: "auth/google/complete:POST",
      message: "Google login via pasted code",
      data: {
        email: result.email,
        calendarConnected: result.calendarConnected,
        synced: result.synced,
      },
      hypothesisId: "H10",
      runId: "post-fix",
    });
    // #endregion
    return NextResponse.json({
      ok: true,
      email: result.email,
      calendarConnected: result.calendarConnected,
      synced: result.synced,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo completar el inicio de sesión";
    // #region agent log
    agentDebugLog({
      location: "auth/google/complete:POST",
      message: "Google login via pasted code failed",
      data: { error: message },
      hypothesisId: "H10",
      runId: "post-fix",
    });
    // #endregion
    return jsonError(message);
  }
}
