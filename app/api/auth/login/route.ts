import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jsonDbUnavailable } from "@/lib/api";
import { createSessionToken, loginWithCredentials } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { usesSecureCookies } from "@/lib/cookie-secure";
import { isDatabaseUnavailable } from "@/lib/db-errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation/schemas";
import { agentDebugLog } from "@/lib/debug-log";

export async function POST(request: Request) {
  const t0 = Date.now();
  // #region agent log
  agentDebugLog({
    hypothesisId: "LOGIN-D",
    location: "app/api/auth/login/route.ts:POST",
    message: "login_start",
    data: { t0 },
  });
  // #endregion

  const rate = await checkRateLimit(request);
  const tRate = Date.now();
  // #region agent log
  agentDebugLog({
    hypothesisId: "LOGIN-A",
    location: "app/api/auth/login/route.ts:POST",
    message: "after_rate_limit",
    data: { ms: tRate - t0, allowed: rate.allowed },
  });
  // #endregion
  if (!rate.allowed) return rateLimitResponse(rate);

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  let session;
  try {
    session = await loginWithCredentials(email, password);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return jsonDbUnavailable();
    throw error;
  }
  const tAuth = Date.now();
  // #region agent log
  agentDebugLog({
    hypothesisId: "LOGIN-B",
    location: "app/api/auth/login/route.ts:POST",
    message: "after_credentials",
    data: { ms: tAuth - tRate, ok: Boolean(session) },
  });
  // #endregion

  if (!session) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = await createSessionToken(session);
  const tToken = Date.now();
  // #region agent log
  agentDebugLog({
    hypothesisId: "LOGIN-C",
    location: "app/api/auth/login/route.ts:POST",
    message: "after_token",
    data: { ms: tToken - tAuth, totalMs: tToken - t0 },
  });
  // #endregion

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: usesSecureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true, email: session.email });
}
