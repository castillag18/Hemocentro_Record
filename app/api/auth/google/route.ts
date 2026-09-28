import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isDatabaseUnavailable } from "@/lib/db-errors";
import {
  getGoogleAuthUrl,
  getGoogleRedirectUri,
  googleCalendarConfigured,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { createOAuthState } from "@/lib/google-oauth-state";
import { getSettings } from "@/lib/settings";
import { usesSecureCookies } from "@/lib/cookie-secure";
import { agentDebugLog } from "@/lib/debug-log";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const STATE_COOKIE = "google_oauth_state";
const MODE_COOKIE = "google_oauth_mode";

export async function GET(request: Request) {
  const rate = await checkRateLimit(request);
  if (!rate.allowed) return rateLimitResponse(rate);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") === "calendar" ? "calendar" : "login";

  try {
    if (!(await googleOAuthConfigured())) {
      const target =
        mode === "calendar"
          ? `${baseUrl}/configuracion?error=google_not_configured`
          : `${baseUrl}/login?error=google_not_configured`;
      return NextResponse.redirect(target);
    }
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      const target =
        mode === "calendar"
          ? `${baseUrl}/configuracion?error=database_unavailable`
          : `${baseUrl}/login?error=database_unavailable`;
      return NextResponse.redirect(target);
    }
    throw error;
  }

  const state = createOAuthState(mode);

  const jar = await cookies();
  const cookieSecure = usesSecureCookies();
  // #region agent log
  agentDebugLog({
    location: "google/route:GET",
    message: "OAuth redirect start",
    data: { mode, cookieSecure, redirectUri: getGoogleRedirectUri() },
    hypothesisId: "H6",
  });
  // #endregion
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: 600,
  });
  jar.set(MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: 600,
  });

  const settings = await getSettings();
  const requestCalendar = mode === "calendar" || !googleCalendarConfigured(settings);
  const url = await getGoogleAuthUrl(state, { mode, requestCalendar });
  return NextResponse.redirect(url);
}
