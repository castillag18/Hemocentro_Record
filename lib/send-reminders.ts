import { prisma } from "./prisma";
import { getSettings, whatsappApiConfigured } from "./settings";
import { buildTemplateVars, interpolate } from "./templates";
import { sendEmail, smtpConfigured } from "./email";
import { persistDonorWhatsAppChatId } from "./openwa-contacts";
import { buildWhatsAppUrl, openWaConfigured, sendOpenWaMessage, sendWhatsAppApiMessage } from "./whatsapp";
import { getWhatsappDailyRemaining, getWhatsappSentTodayCount } from "./whatsapp-limit";
import { startOfDay } from "./dates";
import type { TemplateKind } from "./constants";
import type { EligibleDonor } from "./eligibility";
import type { TemplateVars } from "./interpolate";

type SendResult = {
  email: { sent: number; failed: { id: string; name: string; error: string }[] };
  whatsapp: {
    donorId: string;
    name: string;
    phone: string;
    url: string;
    message: string;
  }[];
  whatsappApi: { sent: number; failed: { id: string; name: string; error: string }[] };
  whatsappOpenWa: { sent: number; failed: { id: string; name: string; error: string }[] };
  whatsappLimit: { sentToday: number; limit: number; remaining: number };
};

export async function sendRemindersToDonors(options: {
  donors: EligibleDonor[];
  channels?: Array<"email" | "whatsapp">;
  explicitChannel?: boolean;
  templateKind?: TemplateKind;
  referenceKey?: string;
  extraVars?: Partial<TemplateVars>;
}) {
  const channels = options.channels?.length ? options.channels : ["email", "whatsapp"];
  const explicitChannel = options.explicitChannel ?? false;
  const selected = options.donors;
  const templateKind = options.templateKind ?? "reminder";
  const referenceKey = options.referenceKey ?? "";
  const extraVars = options.extraVars ?? {};

  const [settings, emailTemplate, waTemplate] = await Promise.all([
    getSettings(),
    prisma.messageTemplate.findFirst({
      where: { channel: "email", kind: templateKind },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.messageTemplate.findFirst({
      where: { channel: "whatsapp", kind: templateKind },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const sentToday = await getWhatsappSentTodayCount();
  const limit = settings.whatsappDailyLimit || 1000;
  let whatsappSentThisBatch = 0;

  const result: SendResult = {
    email: { sent: 0, failed: [] },
    whatsapp: [],
    whatsappApi: { sent: 0, failed: [] },
    whatsappOpenWa: { sent: 0, failed: [] },
    whatsappLimit: { sentToday, limit, remaining: Math.max(0, limit - sentToday) },
  };

  const useWhatsappApi = whatsappApiConfigured(settings);
  const useOpenWa = openWaConfigured(settings);

  for (const donor of selected) {
    const vars = {
      ...buildTemplateVars({
        name: donor.name,
        lastDonationDate: donor.lastDonationDate,
        bloodType: donor.bloodType,
        nextDonationDate: donor.nextDonationDate,
        appointmentLink: settings.appointmentLink,
      }),
      ...extraVars,
    };

    const wantsEmail =
      channels.includes("email") &&
      (explicitChannel ||
        donor.preferredChannel === "email" ||
        donor.preferredChannel === "ambos");
    const wantsWhatsapp =
      channels.includes("whatsapp") &&
      (explicitChannel ||
        donor.preferredChannel === "whatsapp" ||
        donor.preferredChannel === "ambos");

    if (wantsEmail) {
      if (!donor.email) {
        result.email.failed.push({ id: donor.id, name: donor.name, error: "Sin correo electrónico" });
        await logReminder(donor, "email", "fallido", templateKind, referenceKey, "Sin correo electrónico");
      } else if (!emailTemplate) {
        result.email.failed.push({ id: donor.id, name: donor.name, error: "No hay plantilla de correo" });
      } else {
        try {
          if (!smtpConfigured(settings)) throw new Error("SMTP no está configurado");
          await sendEmail({
            settings,
            to: donor.email,
            subject: interpolate(emailTemplate.subject, vars),
            html: interpolate(emailTemplate.body, vars),
            imageUrl: emailTemplate.imageUrl || undefined,
          });
          await logReminder(donor, "email", "enviado", templateKind, referenceKey);
          result.email.sent += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Error al enviar correo";
          result.email.failed.push({ id: donor.id, name: donor.name, error: message });
          await logReminder(donor, "email", "fallido", templateKind, referenceKey, message);
        }
      }
    }

    if (wantsWhatsapp) {
      if (!waTemplate) continue;
      const message = interpolate(waTemplate.body, vars);
      const imageUrl = waTemplate.imageUrl || undefined;

      if (!donor.phone) {
        await logReminder(donor, "whatsapp", "fallido", templateKind, referenceKey, "Sin teléfono válido");
        continue;
      }

      if (sentToday + whatsappSentThisBatch >= limit) {
        result.whatsappOpenWa.failed.push({
          id: donor.id,
          name: donor.name,
          error: `Límite diario de WhatsApp alcanzado (${limit}/día)`,
        });
        await logReminder(
          donor,
          "whatsapp",
          "fallido",
          templateKind,
          referenceKey,
          "Límite diario de WhatsApp alcanzado",
        );
        continue;
      }

      if (useOpenWa) {
        try {
          const sendResult = await sendOpenWaMessage({
            baseUrl: settings.whatsappOpenWaUrl,
            apiKey: settings.whatsappOpenWaApiKey,
            sessionId: settings.whatsappOpenWaSessionId,
            to: donor.phone,
            message,
            imageUrl,
            appBaseUrl,
          });
          await persistDonorWhatsAppChatId(
            donor.id,
            (sendResult as { chatId?: string }).chatId,
          );
          await logReminder(donor, "whatsapp", "enviado", templateKind, referenceKey);
          result.whatsappOpenWa.sent += 1;
          whatsappSentThisBatch += 1;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Error OpenWA";
          result.whatsappOpenWa.failed.push({ id: donor.id, name: donor.name, error: errorMessage });
          await logReminder(donor, "whatsapp", "fallido", templateKind, referenceKey, errorMessage);
        }
        continue;
      }

      if (useWhatsappApi) {
        try {
          await sendWhatsAppApiMessage({
            accessToken: settings.whatsappAccessToken,
            phoneNumberId: settings.whatsappPhoneNumberId,
            apiVersion: settings.whatsappApiVersion,
            to: donor.phone,
            message,
            imageUrl,
          });
          await logReminder(donor, "whatsapp", "enviado", templateKind, referenceKey);
          result.whatsappApi.sent += 1;
          whatsappSentThisBatch += 1;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Error WhatsApp API";
          result.whatsappApi.failed.push({ id: donor.id, name: donor.name, error: errorMessage });
          await logReminder(donor, "whatsapp", "fallido", templateKind, referenceKey, errorMessage);
        }
        continue;
      }

      const url = buildWhatsAppUrl(donor.phone, message);
      if (!url) {
        await logReminder(donor, "whatsapp", "fallido", templateKind, referenceKey, "Sin teléfono válido");
        continue;
      }
      result.whatsapp.push({
        donorId: donor.id,
        name: donor.name,
        phone: donor.phone,
        url,
        message,
      });
    }
  }

  result.whatsappLimit = {
    sentToday: sentToday + whatsappSentThisBatch,
    limit,
    remaining: await getWhatsappDailyRemaining(limit),
  };

  return result;
}

async function logReminder(
  donor: EligibleDonor,
  channel: string,
  status: string,
  messageKind: TemplateKind,
  referenceKey: string,
  error?: string,
) {
  await prisma.reminderLog.create({
    data: {
      donorId: donor.id,
      channel,
      status,
      messageKind,
      referenceKey,
      error,
      donationDateRef: startOfDay(donor.lastDonationDate),
    },
  });
}
