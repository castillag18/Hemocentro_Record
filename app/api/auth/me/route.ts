import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { agentDebugLog } from "@/lib/debug-log";

export async function GET() {
  const t0 = Date.now();
  const session = await getSessionUser();
  // #region agent log
  agentDebugLog({
    hypothesisId: "PERF-B",
    location: "app/api/auth/me/route.ts:GET",
    message: "me_timing",
    data: { totalMs: Date.now() - t0, ok: Boolean(session) },
  });
  // #endregion
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.json(session);
}
