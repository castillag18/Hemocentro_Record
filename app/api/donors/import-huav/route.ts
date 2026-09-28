import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import { importDonorsFromHuav } from "@/lib/import-donors-huav";

export async function POST() {
  const { error } = await withAdminAuth();
  if (error) return error;

  try {
    const result = await importDonorsFromHuav();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo importar desde HUAV";
    return jsonError(message);
  }
}
