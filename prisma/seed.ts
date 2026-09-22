import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ensureDefaultTemplates } from "../lib/template-defaults";
import { DEFAULT_SPECIAL_DATES } from "../lib/constants";
import { HEMOCENTRO_SITE } from "../lib/hemocentro-hours";

const prisma = new PrismaClient();

function daysAgo(days: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@hemocentro.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: adminName, role: "admin", active: true },
    create: {
      email: adminEmail,
      name: adminName,
      role: "admin",
      passwordHash,
      active: true,
    },
  });

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      siteName: HEMOCENTRO_SITE.name,
      siteAddress: HEMOCENTRO_SITE.address,
      sitePhone: HEMOCENTRO_SITE.phone,
    },
    create: {
      id: "default",
      reminderDays: 90,
      femaleWholeBloodMonths: 4,
      femaleApheresisMonths: 1,
      maleWholeBloodMonths: 3,
      maleApheresisMonths: 1,
      specialDatesJson: JSON.stringify(DEFAULT_SPECIAL_DATES),
      siteName: HEMOCENTRO_SITE.name,
      siteAddress: HEMOCENTRO_SITE.address,
      sitePhone: HEMOCENTRO_SITE.phone,
      appointmentLink: "https://huav.local/citas",
      smtpHost: process.env.SMTP_HOST ?? "",
      smtpPort: Number(process.env.SMTP_PORT ?? 587) || 587,
      smtpUser: process.env.SMTP_USER ?? "",
      smtpPass: process.env.SMTP_PASS ?? "",
      smtpFrom: process.env.SMTP_FROM ?? "",
      whatsappMode: process.env.WHATSAPP_MODE ?? "wame",
      whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? "",
      whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
      whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
      whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
      whatsappOpenWaUrl: process.env.WHATSAPP_OPENWA_URL ?? "http://localhost:2785",
      whatsappOpenWaApiKey: process.env.WHATSAPP_OPENWA_API_KEY ?? "",
      whatsappOpenWaSessionId: process.env.WHATSAPP_OPENWA_SESSION_ID ?? "default",
    },
  });

  await ensureDefaultTemplates();

  const samples = [
    {
      name: "Carlos Mendoza Ruiz",
      documentId: "0923456781",
      bloodType: "O+",
      gender: "M",
      donationType: "total",
      lastDonationDate: daysAgo(92),
      phone: "3001234567",
      email: "carlos.m@email.com",
      preferredChannel: "ambos",
    },
    {
      name: "María Fernanda López",
      documentId: "1712345678",
      bloodType: "A-",
      gender: "F",
      donationType: "total",
      lastDonationDate: daysAgo(94),
      phone: "3107654321",
      email: "m.lopez@email.com",
      preferredChannel: "email",
    },
    {
      name: "Juan Pérez Castro",
      documentId: "0102030405",
      bloodType: "B+",
      gender: "M",
      donationType: "aferesis",
      lastDonationDate: daysAgo(30),
      phone: "3208877665",
      email: null,
      preferredChannel: "whatsapp",
    },
    {
      name: "Elena Vargas Silva",
      documentId: "1100223344",
      bloodType: "AB+",
      gender: "F",
      donationType: "aferesis",
      lastDonationDate: daysAgo(103),
      phone: "3016543210",
      email: "elena.v@email.com",
      preferredChannel: "ambos",
    },
    {
      name: "Ana López",
      documentId: "521009988",
      bloodType: "O-",
      gender: "F",
      donationType: "total",
      lastDonationDate: new Date(),
      phone: "3155550192",
      email: "ana.lopez@email.com",
      preferredChannel: "whatsapp",
    },
  ];

  for (const donor of samples) {
    await prisma.donor.upsert({
      where: { documentId: donor.documentId },
      update: {},
      create: donor,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
