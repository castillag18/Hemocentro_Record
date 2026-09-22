"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/dates";
import { BloodTypeBadge } from "@/components/BloodTypeBadge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { WhatsAppQueueModal, type WhatsAppQueueItem } from "@/components/WhatsAppQueueModal";

type DashboardData = {
  reminderDays: number;
  totalDonors: number;
  donationsToday: number;
  pendingReminders: number;
  sentToday: number;
  eligible: Array<{
    id: string;
    name: string;
    bloodType: string;
    lastDonationDate: string;
    daysPassed: number;
    phone: string | null;
    email: string | null;
    preferredChannel: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<WhatsAppQueueItem[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<DashboardData>("/api/dashboard"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendOne(donorId: string, channel: "whatsapp" | "email") {
    setNotice("");
    try {
      const result = await api<{
        email: { sent: number; failed: { error: string }[] };
        whatsapp: WhatsAppQueueItem[];
      }>("/api/reminders/send", {
        method: "POST",
        body: JSON.stringify({ donorIds: [donorId], channels: [channel] }),
      });
      if (channel === "whatsapp" && result.whatsapp.length) {
        setQueue(result.whatsapp);
        setQueueOpen(true);
      } else if (channel === "email") {
        setNotice(
          result.email.sent
            ? "Correo enviado"
            : result.email.failed[0]?.error || "No se pudo enviar el correo",
        );
        await load();
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error al enviar");
    }
  }

  return (
    <div>
      <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-sm">
        <div>
          <h1 className="text-display-lg text-on-surface mb-xs max-md:text-headline-lg">
            Resumen de hoy
          </h1>
          <p className="text-body-lg text-on-surface-variant">
            Estadísticas en tiempo real de la operación del banco de sangre.
          </p>
        </div>
        <Link
          href="/donantes?nuevo=1"
          className="px-md py-2 bg-primary-container text-white text-title-md rounded-lg shadow-level-1 hover:opacity-90 inline-flex items-center gap-2"
        >
          <Icon name="add" /> Nuevo registro
        </Link>
      </div>

      {error ? <p className="text-error mb-md">{error}</p> : null}
      {notice ? <p className="text-body-sm text-tertiary-container mb-md">{notice}</p> : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-md mb-lg">
        <Metric
          label="Donantes activos"
          value={data?.totalDonors ?? "—"}
          icon="group"
          hint="Base registrada"
        />
        <Metric
          label="Donaciones de hoy"
          value={data?.donationsToday ?? "—"}
          icon="bloodtype"
          hint="Fecha de última donación = hoy"
        />
        <Metric
          label="Recordatorios pendientes"
          value={data?.pendingReminders ?? "—"}
          icon="notifications_active"
          accent="amber"
          hint="Según género y tipo de donación (Configuración)"
          href="/recordatorios"
        />
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-level-1 overflow-hidden">
        <div className="p-md border-b border-[#E2E8F0] flex justify-between items-center">
          <div>
            <h3 className="text-title-lg">Donantes elegibles para contactar</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">
              Ya cumplieron el periodo de espera desde su última donación.
            </p>
          </div>
          <Link href="/recordatorios" className="text-primary text-title-md hover:underline inline-flex items-center gap-1">
            Ver todos <Icon name="arrow_forward" className="text-[18px]" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#F1F5F9] border-b border-[#E2E8F0]">
              <tr>
                <th className="text-label-md py-sm px-md uppercase">Donante</th>
                <th className="text-label-md py-sm px-md uppercase">Grupo</th>
                <th className="text-label-md py-sm px-md uppercase">Última donación</th>
                <th className="text-label-md py-sm px-md uppercase">Días</th>
                <th className="text-label-md py-sm px-md uppercase text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="text-body-sm divide-y divide-[#E2E8F0]">
              {(data?.eligible ?? []).map((donor) => (
                <tr key={donor.id} className="hover:bg-surface-container-low">
                  <td className="py-sm px-md font-medium">{donor.name}</td>
                  <td className="py-sm px-md">
                    <BloodTypeBadge type={donor.bloodType} />
                  </td>
                  <td className="py-sm px-md text-on-surface-variant">
                    {formatDate(donor.lastDonationDate)}
                  </td>
                  <td className="py-sm px-md">
                    <span className="text-tertiary-container font-semibold">{donor.daysPassed} días</span>
                  </td>
                  <td className="py-sm px-md text-right space-x-2">
                    {donor.phone ? (
                      <Button
                        variant="outline"
                        className="!py-1 !px-3"
                        onClick={() => void sendOne(donor.id, "whatsapp")}
                      >
                        WhatsApp
                      </Button>
                    ) : null}
                    {donor.email ? (
                      <Button
                        variant="outline"
                        className="!py-1 !px-3"
                        onClick={() => void sendOne(donor.id, "email")}
                      >
                        Correo
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!data?.eligible.length ? (
                <tr>
                  <td colSpan={5} className="py-lg px-md text-center text-secondary">
                    No hay donantes pendientes de recordatorio.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
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

function Metric({
  label,
  value,
  icon,
  hint,
  accent,
  href,
}: {
  label: string;
  value: number | string;
  icon: string;
  hint: string;
  accent?: "amber";
  href?: string;
}) {
  const content = (
    <div className="bg-white rounded-xl p-md border border-[#E2E8F0] shadow-level-1 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accent === "amber" ? "bg-amber" : "bg-primary-container"}`} />
      <div className="flex justify-between items-start mb-md">
        <div>
          <p className="text-label-md text-on-surface-variant uppercase mb-1">{label}</p>
          <h3 className="text-display-lg max-md:text-headline-lg">{value}</h3>
        </div>
        <div className={`p-2 rounded-lg ${accent === "amber" ? "bg-amber-soft text-amber" : "bg-surface-container text-primary"}`}>
          <Icon name={icon} />
        </div>
      </div>
      <p className={`text-body-sm ${accent === "amber" ? "text-amber" : "text-on-surface-variant"}`}>
        {hint}
      </p>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
