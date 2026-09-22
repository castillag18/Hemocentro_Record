import { NextResponse } from "next/server";
import { jsonError, withAuth } from "@/lib/api";
import { getDonorsForManualSend, getEligibleDonors } from "@/lib/eligibility";
import { sendRemindersToDonors } from "@/lib/send-reminders";
import { getSettings } from "@/lib/settings";
import { openWaConfigured } from "@/lib/whatsapp";

type Body = {
  donorIds?: string[];
  channels?: Array<"email" | "whatsapp">;
  /** Reenvío manual: permite notificar aunque ya se haya enviado en este ciclo */
  force?: boolean;
};

export async function POST(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const body = (await request.json().catch(() => ({}))) as Body;
  const settings = await getSettings();
  const useOpenWa = openWaConfigured(settings);
  const channels = body.channels?.length
    ? body.channels
    : useOpenWa
      ? (["whatsapp"] as Array<"email" | "whatsapp">)
      : (["email", "whatsapp"] as Array<"email" | "whatsapp">);
  const explicitChannel = Boolean(body.channels?.length && body.donorIds?.length);
  const force = Boolean(body.force);

  let selected;
  if (body.donorIds?.length) {
    selected = force
      ? await getDonorsForManualSend(body.donorIds)
      : (await getEligibleDonors()).eligible.filter(
          (d) => body.donorIds!.includes(d.id) && d.reminderStatus !== "enviado",
        );
  } else {
    selected = (await getEligibleDonors()).eligible.filter((d) => d.reminderStatus !== "enviado");
  }

  if (!selected.length) {
    return jsonError(
      force
        ? "No se encontraron donantes elegibles para reenviar"
        : "No hay donantes pendientes para notificar",
    );
  }

  const result = await sendRemindersToDonors({
    donors: selected,
    channels,
    explicitChannel,
  });

  return NextResponse.json(result);
}
