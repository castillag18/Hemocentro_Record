import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import { getGoogleAuthUrl, googleOAuthConfigured } from "@/lib/google-oauth";
import { createOAuthState } from "@/lib/google-oauth-state";

export async function GET() {
  const { error } = await withAdminAuth();
  if (error) return error;

  if (!(await googleOAuthConfigured())) {
    return jsonError("Google OAuth no configurado en el servidor (.env)");
  }

  const state = createOAuthState("calendar");
  const url = await getGoogleAuthUrl(state, { mode: "calendar", requestCalendar: true });
  return NextResponse.json({ url });
}
