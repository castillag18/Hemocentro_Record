import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSessionToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";
import { syncPendingAppointmentsToCalendar } from "@/lib/google-calendar";
import { exchangeGoogleCode } from "@/lib/google-oauth";
import { consumeOAuthState } from "@/lib/google-oauth-state";
import { getSettings } from "@/lib/settings";
import { isDatabaseUnavailable } from "@/lib/db-errors";
import { usesSecureCookies } from "@/lib/cookie-secure";
import { agentDebugLog } from "@/lib/debug-log";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

const STATE_COOKIE = "google_oauth_state";
const MODE_COOKIE = "google_oauth_mode";

function appendQuery(base: string, key: string, value: string) {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${key}=${encodeURIComponent(value)}`;
}

async function saveGoogleCalendarTokens(googleUser: {
  email: string;
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: Date | null;
}) {
  const current = await getSettings();
  await prisma.settings.update({
    where: { id: "default" },
    data: {
      googleRefreshToken: googleUser.refreshToken ?? undefined,
      googleAccessToken: googleUser.accessToken ?? undefined,
      googleTokenExpiry: googleUser.expiryDate ?? undefined,
      googleConnectedEmail: googleUser.email,
      googleCalendarId: current.googleCalendarId || "primary",
    },
  });
  const updated = await getSettings();
  return syncPendingAppointmentsToCalendar(updated);
}

export async function GET(request: Request) {
  const rate = await checkRateLimit(request);
  if (!rate.allowed) return rateLimitResponse(rate);

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const jar = await cookies();
  const pending = state ? consumeOAuthState(state) : null;
  const cookieMode = jar.get(MODE_COOKIE)?.value;
  const cookieState = jar.get(STATE_COOKIE)?.value;
  const mode =
    pending?.mode ??
    (cookieMode === "calendar" ? "calendar" : "login");
  const stateValid =
    Boolean(pending) || Boolean(state && cookieState && state === cookieState);
  // #region agent log
  agentDebugLog({
    location: "google/callback:GET",
    message: "OAuth callback state check",
    data: {
      mode,
      stateValid,
      hasCode: Boolean(code),
      hasCookieState: Boolean(cookieState),
      cookieSecure: usesSecureCookies(),
      error: error ?? null,
    },
    hypothesisId: "H6",
  });
  // #endregion
  const errorTarget =
    mode === "calendar" ? `${baseUrl}/configuracion?tab=canales` : `${baseUrl}/login`;

  if (error) {
    const reason = error === "access_denied" ? "google_test_user" : "google_denied";
    jar.delete(STATE_COOKIE);
    jar.delete(MODE_COOKIE);
    return NextResponse.redirect(appendQuery(errorTarget, "error", reason));
  }

  jar.delete(STATE_COOKIE);
  jar.delete(MODE_COOKIE);

  if (!code || !state || !stateValid) {
    const scope = searchParams.get("scope") || "";
    const calendarScopeRequested = scope.includes("calendar");
    if (code && (calendarScopeRequested || mode === "calendar")) {
      return NextResponse.redirect(
        `${baseUrl}/citas?oauth_code=${encodeURIComponent(code)}`,
      );
    }
    return NextResponse.redirect(appendQuery(errorTarget, "error", "google_invalid"));
  }

  try {
    const googleUser = await exchangeGoogleCode(code);
    if (!googleUser.email) {
      return NextResponse.redirect(appendQuery(errorTarget, "error", "google_no_email"));
    }

    if (mode === "calendar") {
      const current = await getSettings();
      const refreshToken = googleUser.refreshToken ?? current.googleRefreshToken;
      if (!refreshToken) {
        return NextResponse.redirect(
          appendQuery(errorTarget, "error", "google_no_refresh") + "&hint=revoke_access",
        );
      }
      const sync = await saveGoogleCalendarTokens({ ...googleUser, refreshToken });
      // #region agent log
      agentDebugLog({
        location: "google/callback:calendar",
        message: "OAuth calendar connected",
        data: {
          email: googleUser.email,
          hasRefreshToken: Boolean(refreshToken),
          synced: sync.synced,
          failed: sync.failed,
        },
        hypothesisId: "H3",
      });
      // #endregion
      return NextResponse.redirect(
        `${baseUrl}/configuracion?google=connected&synced=${sync.synced}`,
      );
    }

    const admin = await prisma.adminUser.findFirst({
      where: { email: googleUser.email, active: true },
    });

    if (!admin) {
      return NextResponse.redirect(
        appendQuery(errorTarget, "error", "google_not_authorized") +
          `&email=${encodeURIComponent(googleUser.email)}`,
      );
    }

    const current = await getSettings();
    const refreshToken = googleUser.refreshToken ?? current.googleRefreshToken;
    let sync = { synced: 0, failed: 0 };
    if (refreshToken) {
      sync = await saveGoogleCalendarTokens({ ...googleUser, refreshToken });
    }

    const token = await createSessionToken({ userId: admin.id, email: admin.email });
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: usesSecureCookies(),
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    const loginTarget = refreshToken
      ? `${baseUrl}/?google=login_ok&calendar=connected&synced=${sync.synced}`
      : `${baseUrl}/?google=login_ok&calendar=pending`;
    return NextResponse.redirect(loginTarget);
  } catch (error) {
    // #region agent log
    agentDebugLog({
      location: "google/callback:error",
      message: "OAuth callback failed",
      data: {
        mode,
        errorType: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      hypothesisId: "H2",
    });
    // #endregion
    if (isDatabaseUnavailable(error)) {
      return NextResponse.redirect(appendQuery(errorTarget, "error", "database_unavailable"));
    }
    return NextResponse.redirect(appendQuery(errorTarget, "error", "google_failed"));
  }
}
