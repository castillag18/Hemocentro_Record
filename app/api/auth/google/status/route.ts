import { NextResponse } from "next/server";
import {
  getGoogleJavascriptOrigin,
  getGoogleRedirectUri,
  googleOAuthConfigured,
  googleOAuthEnvConfigured,
} from "@/lib/google-oauth";

export async function GET() {
  const configured = await googleOAuthConfigured();
  return NextResponse.json({
    configured,
    fromEnv: googleOAuthEnvConfigured(),
    redirectUri: getGoogleRedirectUri(),
    javascriptOrigin: getGoogleJavascriptOrigin(),
  });
}
