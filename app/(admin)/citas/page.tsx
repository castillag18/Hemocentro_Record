"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/dates";
import { BloodTypeBadge } from "@/components/BloodTypeBadge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Pagination } from "@/components/Pagination";
import { LoadingOverlay } from "@/components/Spinner";
import { alertError, alertSuccess, showLoading, closeLoading } from "@/lib/alerts";

type AppointmentRow = {
  id: string;
  scheduledAt: string;
  googleEventId: string | null;
  status: string;
  source: string;
  donor: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    bloodType: string;
  };
};

type AppointmentsData = {
  total: number;
  page: number;
  pageSize: number;
  appointments: AppointmentRow[];
};

type SettingsFlags = {
  hasGoogleOAuth: boolean;
  googleConnectedEmail: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

export default function CitasPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AppointmentsData | null>(null);
  const [flags, setFlags] = useState<SettingsFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [oauthCode, setOauthCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [awaitingGoogleReturn, setAwaitingGoogleReturn] = useState(false);
  const autoConnectAttempted = useRef(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "15" });
    const [appointments, settings] = await Promise.all([
      api<AppointmentsData>(`/api/appointments?${params}`),
      api<SettingsFlags>("/api/settings"),
    ]);
    setData(appointments);
    setFlags(settings);
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load().catch((err) => void alertError("Error", err instanceof Error ? err.message : "Error"));
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("google") === "connected") {
      const synced = params.get("synced");
      void alertSuccess(
        "Google Calendar conectado",
        synced && synced !== "0"
          ? `${synced} cita(s) sincronizada(s) con Calendar.`
          : "Calendar vinculado correctamente.",
      );
      window.history.replaceState({}, "", "/citas");
      void load();
    }
  }, [load]);

  async function openCalendarConnect() {
    try {
      showLoading("Redirigiendo a Google Calendar...");
      const { url } = await api<{ url: string }>("/api/auth/google/calendar-url");
      closeLoading();
      setAwaitingGoogleReturn(true);
      window.location.href = url;
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo conectar");
    }
  }

  async function connectWithCode(codeInput?: string) {
    const value = (codeInput ?? oauthCode).trim();
    if (!value) {
      void alertError("Falta código", "Pegue la URL de redirección o el parámetro code de Google.");
      return;
    }
    setConnecting(true);
    showLoading("Conectando Google Calendar...");
    try {
      const result = await api<{ email: string; synced: number }>("/api/google-calendar/connect", {
        method: "POST",
        body: JSON.stringify({ code: value }),
      });
      closeLoading();
      setOauthCode("");
      setNotice("");
      void alertSuccess(
        "Calendar conectado",
        `${result.email} — ${result.synced} cita(s) sincronizada(s).`,
      );
      await load();
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo conectar");
    } finally {
      setConnecting(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const autoCode = params.get("oauth_code");
    if (!autoCode || autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;
    window.history.replaceState({}, "", "/citas");
    setOauthCode(autoCode);
    void connectWithCode(autoCode);
  }, []);

  async function syncCalendar() {
    setNotice("");
    showLoading("Sincronizando citas con Google Calendar...");
    try {
      const result = await api<{
        synced: number;
        failed: number;
        failures?: { appointmentId: string; error: string }[];
      }>("/api/google-calendar/sync", {
        method: "POST",
      });
      closeLoading();
      const detail =
        result.failed > 0 && result.failures?.length
          ? ` Detalle: ${result.failures.map((f) => f.error).join(" | ")}`
          : "";
      setNotice(`Sincronizadas: ${result.synced}. Fallidas: ${result.failed}.${detail}`);
      await load();
      if (result.synced > 0) {
        void alertSuccess("Calendar", `${result.synced} cita(s) enviada(s) a Google Calendar`);
      }
    } catch (err) {
      closeLoading();
      void alertError("Error", err instanceof Error ? err.message : "No se pudo sincronizar");
    }
  }

  return (
    <div>
      <div className="mb-lg flex flex-col md:flex-row md:items-end justify-between gap-sm">
        <div>
          <h1 className="text-display-lg text-on-surface mb-xs max-md:text-headline-lg">Citas agendadas</h1>
          <p className="text-body-md text-secondary">
            Citas confirmadas por WhatsApp. También se reflejan en Google Calendar cuando está conectado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {flags?.hasGoogleOAuth ? (
            <Button variant="outline" onClick={() => void syncCalendar()}>
              <Icon name="sync" /> Sincronizar Calendar
            </Button>
          ) : (
            <Button onClick={() => void openCalendarConnect()}>
              <Icon name="event" /> Conectar Google Calendar
            </Button>
          )}
        </div>
      </div>

      {flags && !flags.hasGoogleOAuth ? (
        <div className="mb-md rounded-lg border border-amber-soft bg-amber-soft/40 p-4 text-body-sm text-secondary space-y-3">
          <div>
            <p className="font-medium text-on-surface mb-1">Google Calendar no conectado</p>
            <p>
              Las citas aparecen aquí, pero no en el calendario del funcionario hasta vincular Google.
            </p>
          </div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Pulse <strong>Conectar Google Calendar</strong> (misma ventana, va a Google).</li>
            <li>Autorice con el correo del hemocentro y el permiso de Calendar.</li>
            <li>Al volver, la app conectará sola. Si falla, pegue la URL con <code>code=</code> abajo.</li>
          </ol>
          {awaitingGoogleReturn ? (
            <p className="text-body-xs text-amber-800">
              Complete la autorización en Google. Si no regresa automáticamente, pegue la URL de redirección.
            </p>
          ) : null}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={oauthCode}
              onChange={(e) => setOauthCode(e.target.value)}
              placeholder="Pegue aquí la URL con code=... de Google"
              className="flex-1 rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface"
            />
            <Button onClick={() => void connectWithCode()} disabled={connecting}>
              {connecting ? "Conectando..." : "Confirmar conexión"}
            </Button>
          </div>
        </div>
      ) : null}

      {notice ? (
        <p className="mb-md text-body-sm text-tertiary-container bg-tertiary-container/20 rounded-lg px-3 py-2">
          {notice}
        </p>
      ) : null}

      {loading ? <LoadingOverlay message="Cargando citas..." /> : null}

      {!loading && data ? (
        <>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead className="bg-surface-container-low text-secondary uppercase text-xs tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Donante</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Hora</th>
                    <th className="px-4 py-3">Grupo</th>
                    <th className="px-4 py-3">Calendar</th>
                  </tr>
                </thead>
                <tbody>
                  {data.appointments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-secondary">
                        No hay citas próximas confirmadas.
                      </td>
                    </tr>
                  ) : (
                    data.appointments.map((item) => (
                      <tr key={item.id} className="border-t border-outline-variant/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-on-surface">{item.donor.name}</div>
                          {item.donor.phone ? (
                            <div className="text-secondary text-xs">{item.donor.phone}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">{formatDate(item.scheduledAt)}</td>
                        <td className="px-4 py-3">{formatTime(item.scheduledAt)}</td>
                        <td className="px-4 py-3">
                          <BloodTypeBadge type={item.donor.bloodType} />
                        </td>
                        <td className="px-4 py-3">
                          {item.googleEventId ? (
                            <span className="inline-flex items-center gap-1 text-tertiary text-xs font-medium">
                              <Icon name="check_circle" className="text-base" /> Sincronizada
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-medium">
                              <Icon name="schedule" className="text-base" /> Pendiente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={Math.max(1, Math.ceil(data.total / data.pageSize))}
            onPageChange={setPage}
          />
        </>
      ) : null}
    </div>
  );
}
