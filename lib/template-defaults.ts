import { prisma } from "./prisma";
import {
  DEFAULT_BIRTHDAY_EMAIL_BODY,
  DEFAULT_BIRTHDAY_EMAIL_SUBJECT,
  DEFAULT_BIRTHDAY_WHATSAPP_BODY,
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_SATISFACTION_EMAIL_BODY,
  DEFAULT_SATISFACTION_EMAIL_SUBJECT,
  DEFAULT_SATISFACTION_WHATSAPP_BODY,
  DEFAULT_SPECIAL_EMAIL_BODY,
  DEFAULT_SPECIAL_EMAIL_SUBJECT,
  DEFAULT_SPECIAL_WHATSAPP_BODY,
  DEFAULT_WHATSAPP_BODY,
  TEMPLATE_KINDS,
  type TemplateKind,
} from "./constants";

const DEFAULTS: Record<
  TemplateKind,
  Record<"whatsapp" | "email", { name: string; subject: string; body: string }>
> = {
  reminder: {
    whatsapp: {
      name: "Recordatorio de donación - WhatsApp",
      subject: "",
      body: DEFAULT_WHATSAPP_BODY,
    },
    email: {
      name: "Recordatorio de donación - Correo",
      subject: DEFAULT_EMAIL_SUBJECT,
      body: DEFAULT_EMAIL_BODY,
    },
  },
  birthday: {
    whatsapp: {
      name: "Felicitación de cumpleaños - WhatsApp",
      subject: "",
      body: DEFAULT_BIRTHDAY_WHATSAPP_BODY,
    },
    email: {
      name: "Felicitación de cumpleaños - Correo",
      subject: DEFAULT_BIRTHDAY_EMAIL_SUBJECT,
      body: DEFAULT_BIRTHDAY_EMAIL_BODY,
    },
  },
  special: {
    whatsapp: {
      name: "Fecha especial - WhatsApp",
      subject: "",
      body: DEFAULT_SPECIAL_WHATSAPP_BODY,
    },
    email: {
      name: "Fecha especial - Correo",
      subject: DEFAULT_SPECIAL_EMAIL_SUBJECT,
      body: DEFAULT_SPECIAL_EMAIL_BODY,
    },
  },
  satisfaction: {
    whatsapp: {
      name: "Encuesta de satisfacción - WhatsApp",
      subject: "",
      body: DEFAULT_SATISFACTION_WHATSAPP_BODY,
    },
    email: {
      name: "Encuesta de satisfacción - Correo",
      subject: DEFAULT_SATISFACTION_EMAIL_SUBJECT,
      body: DEFAULT_SATISFACTION_EMAIL_BODY,
    },
  },
};

export async function ensureDefaultTemplates() {
  for (const kind of TEMPLATE_KINDS) {
    for (const channel of ["whatsapp", "email"] as const) {
      const defaults = DEFAULTS[kind][channel];
      await prisma.messageTemplate.upsert({
        where: { channel_kind: { channel, kind } },
        update: {},
        create: {
          channel,
          kind,
          name: defaults.name,
          subject: defaults.subject,
          body: defaults.body,
        },
      });
    }
  }
}
