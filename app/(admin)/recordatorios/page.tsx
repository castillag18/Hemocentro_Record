"use client";

import { useCallback, useEffect, useState } from "react";
import { api, initials } from "@/lib/client";
import { formatDate } from "@/lib/dates";
import { BLOOD_TYPES } from "@/lib/constants";
import { BloodTypeBadge } from "@/components/BloodTypeBadge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { WhatsAppQueueModal, type WhatsAppQueueItem } from "@/components/WhatsAppQueueModal";
import { Pagination } from "@/components/Pagination";
import { LoadingOverlay } from "@/components/Spinner";
import { alertError, alertSuccess, showLoading, closeLoading } from "@/lib/alerts";

type Eligible = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  bloodType: string;
  lastDonationDate: string;
  nextDonationDate: string;
  reminderStatus: "pendiente" | "enviado" | "fallido";
  preferredChannel: string;
};

type RemindersData = {
  readyToday: number;
  sentToday: number;
  failedToday: number;
  total: number;
  page: number;
  pageSize: number;
  donors: Eligible[];
};

export default function RecordatoriosPage() {
  const [status, setStatus] = useState("pendiente");
  const [bloodType, setBloodType] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RemindersData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [queue, setQueue] = useState<WhatsAppQueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, page: String(page), pageSize: "15" });
    if (bloodType) params.set("bloodType", bloodType);
    if (q.trim()) params.set("q", q.trim());
    setData(await api<RemindersData>(`/api/reminders?${params}`));
    setSelected([]);
    setInitialLoading(false);
  }, [status, bloodType, q, page]);

  useEffect(() => {
    void load().catch((err) => void alertError("Error", err instanceof Error ? err.message : "Error"));
  }, [load]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 15)));

  async function send(
    donorIds?: string[],
    channels?: Array<"email" | "whatsapp">,
    options?: { force?: boolean },
  ) {
    const force = Boolean(options?.force);
    setLoading(true);
    setNotice("");
    showLoading(force ? "Reenviando recordatorios..." : "Enviando recordatorios...");
    try {
      const result = await api<{
        email: { sent: number; failed: { name: string; error: string }[] };
        whatsapp: WhatsAppQueueItem[];
        whatsappOpenWa?: { sent: number; failed: { name: string; error: string }[] };
        whatsappApi?: { sent: number; failed: { name: string; error: string }[] };
      }>("/api/reminders/send", {
        method: "POST",
        body: JSON.stringify({ donorIds, channels, force }),
      });

      const parts: string[] = [];
      if (result.whatsappOpenWa?.sent) {
        parts.push(`WhatsApp enviados: ${result.whatsappOpenWa.sent}`);
      }
      if (result.whatsappOpenWa?.failed.length) {
        parts.push(`WhatsApp fallidos: ${result.whatsappOpenWa.failed.length}`);
      }
      if (result.whatsappApi?.sent) {
        parts.push(`WhatsApp API enviados: ${result.whatsappApi.sent}`);
      }
      if (result.email.sent) parts.push(`Correos enviados: ${result.email.sent}`);
      if (result.email.failed.length) parts.push(`Correos fallidos: ${result.email.failed.length}`);
      if (result.whatsapp.length) parts.push(`Enlaces wa.me en cola: ${result.whatsapp.length}`);

      setNotice(parts.length ? parts.join(". ") + "." : "Envío completado.");
      closeLoading();
      await alertSuccess("Envío completado", parts.length ? parts.join(". ") : "Operación finalizada");
      if (result.whatsapp.length) {
        setQueue(result.whatsapp);
        setQueueOpen(true);
      }
      await load();
    } catch (err) {
      closeLoading();
      void alertError("Error al enviar", err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const allIds = data?.donors.map((d) => d.id) ?? [];
  const selectedDonors = data?.donors.filter((d) => selected.includes(d.id)) ?? [];
  const selectionHasSent = selectedDonors.some((d) => d.reminderStatus === "enviado");

  return (
    <div>
      {loading ? <LoadingOverlay message="Enviando recordatorios..." /> : null}
      {initialLoading && !data ? <LoadingOverlay message="Cargando donantes..." /> : null}
      <div className="flex justify-between items-end mb-lg gap-md flex-wrap">
        <div>
          <h1 className="text-display-lg max-md:text-headline-lg mb-xs">Donantes elegibles</h1>
          <p className="text-body-lg text-secondary">
            Listos para recordatorio según la frecuencia configurada.
          </p>
        </div>
        <Button onClick={() => void send()} disabled={loading}>
          <Icon name="send" /> Enviar recordatorios del día
        </Button>
      </div>

      {notice ? (
        <p className="mb-md text-body-sm rounded-lg bg-surface-container-low p-sm">{notice}</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-lg">
        <Stat icon="group_add" label="Listos hoy" value={data?.readyToday ?? "—"} accent="primary" />
        <Stat icon="mark_email_read" label="Enviados hoy" value={data?.sentToday ?? "—"} accent="tertiary" />
        <Stat icon="error" label="Fallidos hoy" value={data?.failedToday ?? "—"} accent="error" />
      </div>

      <div className="bg-white border border-outline-variant rounded-xl shadow-level-1 overflow-hidden">
        <div className="p-md border-b border-outline-variant bg-surface flex flex-wrap justify-between gap-sm">
          <div className="flex flex-wrap gap-sm">
            {[
              { id: "pendiente", label: "Pendientes" },
              { id: "enviado", label: "Enviados" },
              { id: "fallido", label: "Fallidos" },
              { id: "all", label: "Todos" },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatus(chip.id);
                }}
                className={`px-sm py-xs border rounded-full text-body-sm ${
                  status === chip.id
                    ? "border-primary bg-primary-fixed text-primary"
                    : "border-secondary-container hover:bg-surface-container"
                }`}
              >
                {chip.label}
              </button>
            ))}
            <select
              className="px-sm py-xs border border-secondary-container rounded-full text-body-sm bg-white"
              value={bloodType}
              onChange={(e) => {
                setPage(1);
                setBloodType(e.target.value);
              }}
            >
              <option value="">Todos los grupos</option>
              {BLOOD_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <div className="relative min-w-[200px]">
              <Icon name="search" className="absolute left-2 top-1/2 -translate-y-1/2 text-secondary text-sm" />
              <input
                className="pl-8 pr-3 py-xs border border-secondary-container rounded-full text-body-sm w-full min-w-[200px]"
                placeholder="Buscar donante..."
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
              />
            </div>
          </div>
          {selected.length ? (
            <Button className="!py-1" onClick={() => void send(selected, undefined, { force: true })} disabled={loading}>
              {selectionHasSent ? "Reenviar" : "Enviar"} seleccionados ({selected.length})
            </Button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="p-sm w-12">
                  <input
                    type="checkbox"
                    className="rounded border-secondary-container text-primary-container"
                    checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                    onChange={(e) => setSelected(e.target.checked ? allIds : [])}
                  />
                </th>
                <th className="p-sm text-label-md uppercase">Donante</th>
                <th className="p-sm text-label-md uppercase">Grupo</th>
                <th className="p-sm text-label-md uppercase">Última donación</th>
                <th className="p-sm text-label-md uppercase">Elegible desde</th>
                <th className="p-sm text-label-md uppercase">Estado</th>
                <th className="p-sm text-label-md uppercase text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-outline-variant">
              {(data?.donors ?? []).map((donor) => (
                <tr key={donor.id} className="hover:bg-surface-bright">
                  <td className="p-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(donor.id)}
                      onChange={() => toggle(donor.id)}
                      className="rounded border-secondary-container"
                    />
                  </td>
                  <td className="p-sm">
                    <div className="flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest text-primary flex items-center justify-center text-label-md">
                        {initials(donor.name)}
                      </div>
                      <div>
                        <p className="font-medium">{donor.name}</p>
                        <p className="text-secondary text-xs">{donor.email || donor.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-sm">
                    <BloodTypeBadge type={donor.bloodType} />
                  </td>
                  <td className="p-sm text-secondary">{formatDate(donor.lastDonationDate)}</td>
                  <td className="p-sm font-medium">{formatDate(donor.nextDonationDate)}</td>
                  <td className="p-sm">
                    <StatusPill status={donor.reminderStatus} />
                  </td>
                  <td className="p-sm text-right space-x-1">
                    {donor.phone ? (
                      <button
                        type="button"
                        className="text-primary hover:bg-primary-fixed p-1 rounded"
                        title={donor.reminderStatus === "enviado" ? "Reenviar WhatsApp" : "WhatsApp"}
                        onClick={() =>
                          void send([donor.id], ["whatsapp"], {
                            force: donor.reminderStatus === "enviado",
                          })
                        }
                      >
                        <Icon name="chat" />
                      </button>
                    ) : null}
                    {donor.email ? (
                      <button
                        type="button"
                        className="text-primary hover:bg-primary-fixed p-1 rounded"
                        title={donor.reminderStatus === "enviado" ? "Reenviar correo" : "Correo"}
                        onClick={() =>
                          void send([donor.id], ["email"], {
                            force: donor.reminderStatus === "enviado",
                          })
                        }
                      >
                        <Icon name="mail" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!data?.donors.length ? (
                <tr>
                  <td colSpan={7} className="py-lg text-center text-secondary">
                    No hay donantes en este filtro.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={data?.total ?? 0}
          pageSize={data?.pageSize ?? 15}
          onPageChange={setPage}
        />
      </div>

      <WhatsAppQueueModal
        open={queueOpen}
        items={queue}
        onClose={() => setQueueOpen(false)}
        onDone={() => void load()}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: number | string;
  accent: "primary" | "tertiary" | "error";
}) {
  const border =
    accent === "primary"
      ? "border-l-primary-container"
      : accent === "tertiary"
        ? "border-l-tertiary-container"
        : "border-l-error";
  const color =
    accent === "primary"
      ? "text-primary-container"
      : accent === "tertiary"
        ? "text-tertiary-container"
        : "text-error";
  return (
    <div className={`bg-white p-md border border-outline-variant rounded-xl shadow-level-1 border-l-4 ${border}`}>
      <div className="flex items-center gap-sm mb-xs">
        <Icon name={icon} className={color} />
        <h3 className="text-title-md text-secondary">{label}</h3>
      </div>
      <p className="text-display-lg max-md:text-headline-lg">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: Eligible["reminderStatus"] }) {
  if (status === "enviado") {
    return (
      <span className="inline-flex items-center gap-xs px-2 py-1 rounded-full bg-tertiary-container/20 text-tertiary text-xs font-medium">
        Enviado
      </span>
    );
  }
  if (status === "fallido") {
    return (
      <span className="inline-flex items-center gap-xs px-2 py-1 rounded-full bg-error-container text-on-error-container text-xs font-medium">
        Fallido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-xs px-2 py-1 rounded-full bg-surface-variant text-on-surface-variant text-xs font-medium">
      Pendiente
    </span>
  );
}
