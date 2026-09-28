import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handlePrismaRouteError, jsonError, withAuth } from "@/lib/api";
import { DEFAULT_SPECIAL_DATES, type SpecialDateEntry } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { ensureDefaultTemplates } from "@/lib/template-defaults";

function parseSpecialDatesInput(value: unknown): SpecialDateEntry[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? "").trim();
      const name = String(row.name ?? "").trim();
      const month = Number(row.month);
      const day = Number(row.day);
      if (!id || !name || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      return { id, name, month, day };
    })
    .filter(Boolean) as SpecialDateEntry[];
  return parsed.length ? parsed : null;
}

export async function GET() {
  const { error } = await withAuth();
  if (error) return error;

  try {
    await ensureDefaultTemplates();
    const [templates, settings] = await Promise.all([
      prisma.messageTemplate.findMany({ orderBy: [{ kind: "asc" }, { channel: "asc" }] }),
      getSettings(),
    ]);

    let specialDates = DEFAULT_SPECIAL_DATES;
    try {
      const parsed = JSON.parse(settings.specialDatesJson || "[]") as SpecialDateEntry[];
      if (Array.isArray(parsed) && parsed.length) specialDates = parsed;
    } catch {
      // keep defaults
    }

    return NextResponse.json({
      templates,
      messaging: {
        autoBirthdayEnabled: settings.autoBirthdayEnabled ?? false,
        autoSpecialDatesEnabled: settings.autoSpecialDatesEnabled ?? false,
        autoSatisfactionSurveyEnabled: settings.autoSatisfactionSurveyEnabled ?? false,
        autoSatisfactionSurveyHour: settings.autoSatisfactionSurveyHour ?? 18,
        specialDates,
      },
    });
  } catch (err) {
    return handlePrismaRouteError(err);
  }
}

export async function PUT(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    channel?: "whatsapp" | "email";
    name?: string;
    subject?: string;
    body?: string;
    imageUrl?: string;
    messaging?: {
      autoBirthdayEnabled?: boolean;
      autoSpecialDatesEnabled?: boolean;
      autoSatisfactionSurveyEnabled?: boolean;
      autoSatisfactionSurveyHour?: number;
      specialDates?: SpecialDateEntry[];
    };
  } | null;

  try {
    if (body?.messaging) {
      const specialDates = parseSpecialDatesInput(body.messaging.specialDates);
      await prisma.settings.update({
        where: { id: "default" },
        data: {
          autoBirthdayEnabled: Boolean(body.messaging.autoBirthdayEnabled),
          autoSpecialDatesEnabled: Boolean(body.messaging.autoSpecialDatesEnabled),
          autoSatisfactionSurveyEnabled: Boolean(body.messaging.autoSatisfactionSurveyEnabled),
          autoSatisfactionSurveyHour: Number(body.messaging.autoSatisfactionSurveyHour ?? 18),
          ...(specialDates ? { specialDatesJson: JSON.stringify(specialDates) } : {}),
        },
      });
    }

    if (!body?.id || !body.body) {
      if (body?.messaging) {
        const settings = await getSettings();
        let specialDates = DEFAULT_SPECIAL_DATES;
        try {
          const parsed = JSON.parse(settings.specialDatesJson || "[]") as SpecialDateEntry[];
          if (Array.isArray(parsed) && parsed.length) specialDates = parsed;
        } catch {
          // keep defaults
        }
        return NextResponse.json({
          ok: true,
          messaging: {
            autoBirthdayEnabled: settings.autoBirthdayEnabled ?? false,
            autoSpecialDatesEnabled: settings.autoSpecialDatesEnabled ?? false,
            autoSatisfactionSurveyEnabled: settings.autoSatisfactionSurveyEnabled ?? false,
            autoSatisfactionSurveyHour: settings.autoSatisfactionSurveyHour ?? 18,
            specialDates,
          },
        });
      }
      return jsonError("Plantilla inválida");
    }

    const template = await prisma.messageTemplate.update({
      where: { id: body.id },
      data: {
        name: body.name,
        subject: body.subject ?? "",
        body: body.body,
        imageUrl: body.imageUrl ?? "",
      },
    });

    return NextResponse.json(template);
  } catch (err) {
    return handlePrismaRouteError(err);
  }
}
