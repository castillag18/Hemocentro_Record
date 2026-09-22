import { z } from "zod";
import { BLOOD_TYPES, CHANNELS, DONATION_TYPES, GENDERS } from "@/lib/constants";
import { assertSafeDocumentId, assertSafeEmail, assertSafePhone, assertSafeText } from "./sanitize";

export const loginSchema = z.object({
  email: z.string().trim().transform((v) => assertSafeEmail(v)),
  password: z.string().min(8, "Contraseña mínimo 8 caracteres").max(128),
});

export const donorFormSchema = z.object({
  name: z.string().trim().transform((v) => assertSafeText(v, "Nombre")),
  documentId: z.string().trim().transform((v) => assertSafeDocumentId(v)),
  bloodType: z.enum(BLOOD_TYPES),
  lastDonationDate: z.string().min(1, "Fecha requerida"),
  birthDate: z.string().optional().nullable(),
  phone: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? assertSafePhone(v) : null)),
  email: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v?.trim() ? assertSafeEmail(v) : null)),
  preferredChannel: z.enum(CHANNELS).default("ambos"),
  gender: z.enum(GENDERS).optional().nullable(),
  donationType: z.enum(DONATION_TYPES).default("total"),
  active: z.boolean().optional(),
});

export const userFormSchema = z.object({
  email: z.string().trim().transform((v) => assertSafeEmail(v)),
  password: z.string().min(8, "Contraseña mínimo 8 caracteres").max(128).optional(),
  name: z.string().trim().transform((v) => assertSafeText(v, "Nombre")),
  role: z.enum(["admin", "operador"]),
});

export const userCreateSchema = userFormSchema.extend({
  password: z.string().min(8, "Contraseña mínimo 8 caracteres").max(128),
});

export const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().transform((v) => assertSafeText(v.slice(0, 120), "Nombre")),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1, "El cuerpo del mensaje es obligatorio").max(10000),
});

export const openWaTestSchema = z.object({
  phone: z.string().trim().transform((v) => assertSafePhone(v)),
  message: z.string().trim().max(1000).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type DonorFormInput = z.infer<typeof donorFormSchema>;
export type UserFormInput = z.infer<typeof userFormSchema>;
