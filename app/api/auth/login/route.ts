import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jsonDbUnavailable } from "@/lib/api";
import { createSessionToken, loginWithCredentials } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { usesSecureCookies } from "@/lib/cookie-secure";
import { isDatabaseUnavailable } from "@/lib/db-errors";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  const rate = await checkRateLimit(request);
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

  if (!session) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  const token = await createSessionToken(session);
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
