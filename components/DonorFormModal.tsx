"use client";

import { useEffect, useState } from "react";
import {
  BLOOD_TYPES,
  CHANNELS,
  DONATION_TYPES,
  DONATION_TYPE_LABELS,
  GENDERS,
  GENDER_LABELS,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/dates";
import { api } from "@/lib/client";
import { donorFormSchema } from "@/lib/validation/schemas";
import { alertError, alertSuccess, showLoading, closeLoading } from "@/lib/alerts";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Spinner } from "./Spinner";

export type DonorRecord = {
  id: string;
  name: string;
  documentId: string;
  bloodType: string;
  gender: string | null;
  donationType: string;
  lastDonationDate: string;
  birthDate?: string | null;
  phone: string | null;
  email: string | null;
  preferredChannel: string;
  active: boolean;
};

const EMPTY = {
  name: "",
  documentId: "",
  bloodType: "O+",
  gender: "",
  donationType: "total",
  lastDonationDate: toDateInputValue(new Date()),
  birthDate: "",
  phone: "",
  email: "",
  preferredChannel: "ambos",
};

export function DonorFormModal({
  open,
  donor,
  onClose,
  onSaved,
}: {
  open: boolean;
  donor: DonorRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    if (donor) {
      setForm({
        name: donor.name,
        documentId: donor.documentId,
        bloodType: donor.bloodType,
        gender: donor.gender ?? "",
        donationType: donor.donationType ?? "total",
        lastDonationDate: toDateInputValue(donor.lastDonationDate),
        birthDate: donor.birthDate ? toDateInputValue(donor.birthDate) : "",
        phone: donor.phone ?? "",
        email: donor.email ?? "",
        preferredChannel: donor.preferredChannel,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, donor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const parsed = donorFormSchema.safeParse({
      ...form,
      phone: form.phone || null,
      email: form.email || null,
      gender: form.gender || null,
      birthDate: form.birthDate || null,
    });

    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0] ?? "form")] = issue.message;
      }
      setFieldErrors(errors);
      void alertError("Revise el formulario", Object.values(errors)[0]);
      return;
    }

    setLoading(true);
    showLoading("Guardando donante...");
    try {
      if (donor) {
        await api(`/api/donors/${donor.id}`, {
          method: "PUT",
          body: JSON.stringify(parsed.data),
        });
      } else {
        await api("/api/donors", {
          method: "POST",
          body: JSON.stringify(parsed.data),
        });
      }
      closeLoading();
      await alertSuccess("Guardado", donor ? "Donante actualizado" : "Donante registrado");
      onSaved();
      onClose();
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={donor ? "Editar donante" : "Registrar donante"}
      subtitle="Datos del donante, género, tipo de última donación y contacto."
    >
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-md">
        <label className="block md:col-span-2">
          <span className="text-label-md text-secondary uppercase">Nombre completo</span>
          <input
            maxLength={120}
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm outline-none focus:border-primary"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
          {fieldErrors.name ? <span className="text-xs text-error">{fieldErrors.name}</span> : null}
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Cédula</span>
          <input
            maxLength={20}
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm font-mono outline-none focus:border-primary"
            value={form.documentId}
            onChange={(e) => set("documentId", e.target.value)}
          />
          {fieldErrors.documentId ? <span className="text-xs text-error">{fieldErrors.documentId}</span> : null}
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Grupo sanguíneo</span>
          <select
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm bg-white"
            value={form.bloodType}
            onChange={(e) => set("bloodType", e.target.value)}
          >
            {BLOOD_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Género</span>
          <select
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm bg-white"
            value={form.gender}
            onChange={(e) => set("gender", e.target.value)}
          >
            <option value="">Sin registrar</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {GENDER_LABELS[gender]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Tipo última donación</span>
          <select
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm bg-white"
            value={form.donationType}
            onChange={(e) => set("donationType", e.target.value)}
          >
            {DONATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {DONATION_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Última donación</span>
          <input
            required
            type="date"
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm"
            value={form.lastDonationDate}
            onChange={(e) => set("lastDonationDate", e.target.value)}
          />
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Fecha de nacimiento (opcional)</span>
          <input
            type="date"
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm"
            value={form.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
          />
          <span className="text-body-xs text-secondary">Para mensajes automáticos de cumpleaños</span>
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Teléfono / WhatsApp</span>
          <input
            maxLength={20}
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="3001234567"
          />
          {fieldErrors.phone ? <span className="text-xs text-error">{fieldErrors.phone}</span> : null}
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Correo electrónico</span>
          <input
            type="email"
            maxLength={254}
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          {fieldErrors.email ? <span className="text-xs text-error">{fieldErrors.email}</span> : null}
        </label>
        <label className="block">
          <span className="text-label-md text-secondary uppercase">Canal preferido</span>
          <select
            className="mt-1 w-full border border-secondary-container rounded-lg p-2.5 text-sm bg-white"
            value={form.preferredChannel}
            onChange={(e) => set("preferredChannel", e.target.value)}
          >
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel === "ambos" ? "WhatsApp y correo" : channel === "whatsapp" ? "WhatsApp" : "Correo"}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2 flex justify-end gap-sm">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Spinner size="sm" className="text-white" /> : null}
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
