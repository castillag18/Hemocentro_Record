import { NextResponse } from "next/server";
import { usesSecureCookies } from "@/lib/cookie-secure";
import { agentDebugLog } from "@/lib/debug-log";
import {
  detectGoogleOAuthDeployment,
  isGoogleAllowedOAuthUrl,
} from "@/lib/google-oauth-url";
import {
  getGoogleJavascriptOrigin,
  getGoogleRedirectUri,
  googleOAuthConfigured,
  googleOAuthEnvConfigured,
} from "@/lib/google-oauth";

export async function GET() {
  const configured = await googleOAuthConfigured();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const redirectUri = getGoogleRedirectUri();
  const redirectAllowedByGoogle = isGoogleAllowedOAuthUrl(redirectUri);
  const deployment = detectGoogleOAuthDeployment(redirectUri, appUrl);
  const payload = {
    configured,
    fromEnv: googleOAuthEnvConfigured(),
    redirectUri,
    javascriptOrigin: getGoogleJavascriptOrigin(),
    appUrl,
    cookieSecure: usesSecureCookies(),
    redirectAllowedByGoogle,
    oauthDeployment: deployment,
    redirectMatchesAppUrl: appUrl
      ? redirectUri.startsWith(appUrl.replace(/\/$/, ""))
      : null,
  };
  // #region agent log
  agentDebugLog({
    location: "google/status",
    message: "OAuth status check",
    data: payload,
    hypothesisId: "H1",
  });
  // #endregion
  return NextResponse.json(payload);
}
