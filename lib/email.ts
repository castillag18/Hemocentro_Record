import path from "node:path";
import nodemailer from "nodemailer";
import type { Settings } from "@prisma/client";
import { sanitizeEmailHtml } from "./templates";

export function smtpConfigured(settings: Settings) {
  return Boolean(settings.smtpHost && settings.smtpFrom);
}

function resolvePublicMediaUrl(imageUrl: string, appBaseUrl: string) {
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}${imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`}`;
}

export async function sendEmail(options: {
  settings: Settings;
  to: string;
  subject: string;
  html: string;
  imageUrl?: string;
}) {
  if (!smtpConfigured(options.settings)) {
    throw new Error("SMTP no está configurado. Revise Configuración.");
  }

  const transporter = nodemailer.createTransport({
    host: options.settings.smtpHost,
    port: options.settings.smtpPort,
    secure: options.settings.smtpPort === 465,
    auth:
      options.settings.smtpUser && options.settings.smtpPass
        ? {
            user: options.settings.smtpUser,
            pass: options.settings.smtpPass,
          }
        : undefined,
  });

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let html = options.html;

  const attachments: nodemailer.SendMailOptions["attachments"] = [];
  if (options.imageUrl) {
    const publicUrl = resolvePublicMediaUrl(options.imageUrl, appBaseUrl);
    if (/^https?:\/\//i.test(publicUrl)) {
      html = `<div style="margin-bottom:16px;text-align:center;"><img src="${publicUrl}" alt="Imagen del recordatorio" style="max-width:100%;height:auto;border-radius:8px;" /></div>${html}`;
    } else {
      const localPath = path.join(process.cwd(), "public", options.imageUrl.replace(/^\//, ""));
      attachments.push({
        filename: "recordatorio.jpg",
        path: localPath,
        cid: "recordatorio-image",
      });
      html = `<div style="margin-bottom:16px;text-align:center;"><img src="cid:recordatorio-image" alt="Imagen del recordatorio" style="max-width:100%;height:auto;border-radius:8px;" /></div>${html}`;
    }
  }

  await transporter.sendMail({
    from: options.settings.smtpFrom,
    to: options.to,
    subject: options.subject,
    html: sanitizeEmailHtml(html),
    attachments,
  });
}
