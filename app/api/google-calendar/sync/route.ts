import { NextResponse } from "next/server";
import { jsonError, withAdminAuth } from "@/lib/api";
import { googleCalendarConfigured, syncPendingAppointmentsToCalendar } from "@/lib/google-calendar";
import { getSettings } from "@/lib/settings";

export async function POST() {
  const { error } = await withAdminAuth();
  if (error) return error;

  const settings = await getSettings();
  if (!googleCalendarConfigured(settings)) {
    return jsonError("Google Calendar no está conectado");
  }

  const result = await syncPendingAppointmentsToCalendar(settings);
  return NextResponse.json({ ok: true, ...result });
}
