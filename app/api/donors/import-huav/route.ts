import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import { agentDebugLog } from "@/lib/debug-log";
import { importDonorsFromHuav } from "@/lib/import-donors-huav";

export async function POST() {
  const { error } = await withAdminAuth();
  if (error) return error;

  try {
    const result = await importDonorsFromHuav();
    // #region agent log
    agentDebugLog({
      location: "donors/import-huav:POST",
      message: "HUAV import completed",
      data: result,
      hypothesisId: "H9",
      runId: "post-fix",
    });
    // #endregion
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo importar desde HUAV";
    // #region agent log
    agentDebugLog({
      location: "donors/import-huav:POST",
      message: "HUAV import failed",
      data: { error: message },
      hypothesisId: "H9",
      runId: "post-fix",
    });
    // #endregion
    return jsonError(message);
  }
}
