"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import {
  TEMPLATE_KIND_LABELS,
  TEMPLATE_KINDS,
  TEMPLATE_VARIABLES,
  type SpecialDateEntry,
  type TemplateKind,
} from "@/lib/constants";
import { interpolate } from "@/lib/interpolate";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";

type Template = {
  id: string;
  channel: "whatsapp" | "email";
  kind: TemplateKind;
  name: string;
  subject: string;
  body: string;
  imageUrl: string;
};

type MessagingConfig = {
  autoBirthdayEnabled: boolean;
  autoSpecialDatesEnabled: boolean;
  autoSatisfactionSurveyEnabled: boolean;
  autoSatisfactionSurveyHour: number;
  specialDates: SpecialDateEntry[];
};

const SAMPLE: Record<TemplateKind, Record<string, string>> = {
  reminder: {
    donor_name: "Juan Pérez",
    last_donation_date: "12/05/2026",
    next_donation_date: "10/08/2026",
    blood_type: "O+",
    donation_type: "Sangre total",
    appointment_link: "https://hemocentro.local/citas",
    special_date_name: "",
  },
  birthday: {
    donor_name: "María López",
    last_donation_date: "15/03/2026",
    next_donation_date: "15/06/2026",
    blood_type: "A+",
    donation_type: "Aféresis",
    appointment_link: "https://hemocentro.local/citas",
    special_date_name: "",
  },
  special: {
    donor_name: "Carlos Mendoza",
    last_donation_date: "01/02/2026",
    next_donation_date: "01/05/2026",
    blood_type: "B+",
    donation_type: "Sangre total",
    appointment_link: "https://hemocentro.local/citas",
    special_date_name: "Día Mundial del Donante de Sangre",
  },
  satisfaction: {
    donor_name: "Ana García",
    last_donation_date: "27/09/2026",
    next_donation_date: "27/12/2026",
    blood_type: "O+",
    donation_type: "Sangre total",
    appointment_link: "https://hemocentro.local/citas",
    special_date_name: "",
  },
};

export default function MensajeriaPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [kind, setKind] = useState<TemplateKind>("reminder");
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [draft, setDraft] = useState<Template | null>(null);
  const [messaging, setMessaging] = useState<MessagingConfig>({
    autoBirthdayEnabled: false,
    autoSpecialDatesEnabled: false,
    autoSatisfactionSurveyEnabled: false,
    autoSatisfactionSurveyHour: 18,
    specialDates: [],
  });
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void api<{ templates: Template[]; messaging: MessagingConfig }>("/api/templates").then((res) => {
      setTemplates(res.templates);
      setMessaging(res.messaging);
      const current =
        res.templates.find((t) => t.channel === "whatsapp" && t.kind === "reminder") ??
        res.templates[0];
      if (current) setDraft({ ...current, imageUrl: current.imageUrl ?? "" });
    });
  }, []);

  useEffect(() => {
    const next = templates.find((t) => t.channel === channel && t.kind === kind);
    if (next) setDraft({ ...next, imageUrl: next.imageUrl ?? "" });
  }, [channel, kind, templates]);

  function insertVariable(variable: string) {
    if (!draft) return;
    setDraft({ ...draft, body: `${draft.body}${variable}` });
  }

  function wrap(tag: "b" | "i") {
    if (!draft) return;
    const open = tag === "b" ? "<strong>" : "<em>";
    const close = tag === "b" ? "</strong>" : "</em>";
    if (channel === "whatsapp") {
      const marker = tag === "b" ? "*" : "_";
      setDraft({ ...draft, body: `${draft.body}${marker}texto${marker}` });
      return;
    }
    setDraft({ ...draft, body: `${draft.body}${open}texto${close}` });
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/templates/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "No se pudo subir la imagen");
      }
      setDraft((prev) => (prev ? { ...prev, imageUrl: data.url! } : prev));
      setNotice("Imagen cargada");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error al subir imagen");
    } finally {
      setUploading(false);
    }
  }

  async function saveTemplate() {
    if (!draft) return;
    setSaving(true);
    setNotice("");
    try {
      const saved = await api<Template>("/api/templates", {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setTemplates((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      setNotice("Plantilla guardada");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveMessaging() {
    setSaving(true);
    setNotice("");
    try {
      await api("/api/templates", {
        method: "PUT",
        body: JSON.stringify({ messaging }),
      });
      setNotice("Configuración de envío automático guardada");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  function updateSpecialDate(index: number, patch: Partial<SpecialDateEntry>) {
    setMessaging((prev) => ({
      ...prev,
      specialDates: prev.specialDates.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addSpecialDate() {
    setMessaging((prev) => ({
      ...prev,
      specialDates: [
        ...prev.specialDates,
        {
          id: `custom-${Date.now()}`,
          name: "Nueva fecha especial",
          month: 1,
          day: 1,
        },
      ],
    }));
  }

  const previewBody = useMemo(
    () => (draft ? interpolate(draft.body, SAMPLE[kind] as never) : ""),
    [draft, kind],
  );
  const previewSubject = useMemo(
    () => (draft ? interpolate(draft.subject || "", SAMPLE[kind] as never) : ""),
    [draft, kind],
  );

  if (!draft) {
    return <p className="text-secondary">Cargando plantillas...</p>;
  }

  return (
    <div>
      <div className="mb-lg flex justify-between items-end gap-md flex-wrap">
        <div>
          <h1 className="text-headline-lg mb-xs">Plantillas de mensajería</h1>
          <p className="text-body-md text-secondary">
            Configure recordatorios de donación, cumpleaños y fechas especiales.
          </p>
        </div>
        <div className="flex gap-sm">
          <Button
            variant="outline"
            onClick={() => {
              const original = templates.find((t) => t.id === draft.id);
              if (original) setDraft({ ...original, imageUrl: original.imageUrl ?? "" });
            }}
          >
            Descartar
          </Button>
          <Button onClick={() => void saveTemplate()} disabled={saving}>
            Guardar plantilla
          </Button>
        </div>
      </div>
      {notice ? <p className="mb-md text-body-sm text-tertiary-container">{notice}</p> : null}

      <div className="grid grid-cols-12 gap-gutter min-h-[600px]">
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-md">
          <div className="bg-white rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <label className="text-label-md text-on-surface-variant block mb-sm">TIPO DE MENSAJE</label>
            <div className="flex flex-wrap gap-sm">
              {TEMPLATE_KINDS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setKind(item)}
                  className={`px-md py-2 rounded-lg border text-title-md ${
                    kind === item
                      ? "border-primary bg-primary-fixed text-primary"
                      : "border-outline-variant text-secondary"
                  }`}
                >
                  {TEMPLATE_KIND_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          {(kind === "birthday" || kind === "special" || kind === "satisfaction") && (
            <div className="bg-white rounded-xl p-md shadow-level-1 border border-outline-variant/30 space-y-md">
              <div className="flex items-center gap-2">
                <Icon name="schedule_send" className="text-primary" />
                <h3 className="text-title-lg">Envío automático</h3>
              </div>
              {kind === "birthday" ? (
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={messaging.autoBirthdayEnabled}
                    onChange={(e) =>
                      setMessaging((prev) => ({ ...prev, autoBirthdayEnabled: e.target.checked }))
                    }
                  />
                  <span className="text-body-md">
                    Enviar felicitación automática el día del cumpleaños del donante
                  </span>
                </label>
              ) : kind === "satisfaction" ? (
                <>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={messaging.autoSatisfactionSurveyEnabled}
                      onChange={(e) =>
                        setMessaging((prev) => ({
                          ...prev,
                          autoSatisfactionSurveyEnabled: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-body-md">
                      Enviar encuesta automática por WhatsApp cuando la donación quede registrada en
                      HUAV el mismo día de la cita
                    </span>
                  </label>
                  <div>
                    <label className="block text-label-md text-secondary uppercase mb-2">
                      Hora diaria de envío (0-23)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      className="w-full max-w-xs border border-outline-variant rounded-lg p-2"
                      value={messaging.autoSatisfactionSurveyHour}
                      onChange={(e) =>
                        setMessaging((prev) => ({
                          ...prev,
                          autoSatisfactionSurveyHour: Number(e.target.value) || 18,
                        }))
                      }
                    />
                    <p className="text-body-sm text-secondary mt-1">
                      Verifica en la base HUAV que exista donación el día de la cita antes de enviar.
                      Requiere WhatsApp conectado y variables HUAV_DB_* en el .env.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={messaging.autoSpecialDatesEnabled}
                      onChange={(e) =>
                        setMessaging((prev) => ({
                          ...prev,
                          autoSpecialDatesEnabled: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-body-md">
                      Enviar mensaje automático en las fechas especiales configuradas
                    </span>
                  </label>
                  <div className="space-y-sm">
                    {messaging.specialDates.map((entry, index) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-sm items-end border border-outline-variant/40 rounded-lg p-sm"
                      >
                        <label className="md:col-span-6 block">
                          <span className="text-label-md text-secondary block mb-1">Nombre</span>
                          <input
                            className="w-full p-2 border border-outline-variant rounded-lg"
                            value={entry.name}
                            onChange={(e) => updateSpecialDate(index, { name: e.target.value })}
                          />
                        </label>
                        <label className="md:col-span-3 block">
                          <span className="text-label-md text-secondary block mb-1">Mes</span>
                          <input
                            type="number"
                            min={1}
                            max={12}
                            className="w-full p-2 border border-outline-variant rounded-lg"
                            value={entry.month}
                            onChange={(e) =>
                              updateSpecialDate(index, { month: Number(e.target.value) || 1 })
                            }
                          />
                        </label>
                        <label className="md:col-span-3 block">
                          <span className="text-label-md text-secondary block mb-1">Día</span>
                          <input
                            type="number"
                            min={1}
                            max={31}
                            className="w-full p-2 border border-outline-variant rounded-lg"
                            value={entry.day}
                            onChange={(e) =>
                              updateSpecialDate(index, { day: Number(e.target.value) || 1 })
                            }
                          />
                        </label>
                      </div>
                    ))}
                    <div className="flex gap-sm">
                      <Button variant="outline" onClick={addSpecialDate}>
                        Agregar fecha
                      </Button>
                      <Button onClick={() => void saveMessaging()} disabled={saving}>
                        Guardar envío automático
                      </Button>
                    </div>
                  </div>
                </>
              )}
              {kind === "birthday" || kind === "satisfaction" ? (
                <Button onClick={() => void saveMessaging()} disabled={saving}>
                  Guardar envío automático
                </Button>
              ) : null}
              {kind !== "satisfaction" ? (
                <p className="text-body-sm text-secondary">
                  Los mensajes automáticos usan la misma hora configurada en Configuración → Envío
                  automático de recordatorios.
                </p>
              ) : null}
            </div>
          )}

          <div className="bg-white rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <label className="text-label-md text-on-surface-variant block mb-sm">CANAL</label>
            <div className="flex gap-sm">
              {(["whatsapp", "email"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setChannel(item)}
                  className={`flex-1 p-sm border rounded-lg flex items-center justify-center gap-sm ${
                    channel === item
                      ? "border-primary bg-primary-fixed text-primary"
                      : "border-outline-variant text-secondary"
                  }`}
                >
                  <Icon name={item === "whatsapp" ? "chat" : "mail"} />
                  <span className="text-title-md">{item === "whatsapp" ? "WhatsApp" : "Correo"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <label className="text-label-md text-on-surface-variant block mb-xs">NOMBRE DE PLANTILLA</label>
            <input
              className="w-full p-sm border border-outline-variant rounded-lg outline-none focus:border-primary"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>

          <div className="bg-white rounded-xl p-md shadow-level-1 border border-outline-variant/30">
            <label className="text-label-md text-on-surface-variant block mb-xs">
              IMAGEN ADJUNTA (opcional)
            </label>
            <p className="text-body-sm text-secondary mb-sm">
              Se envía junto al mensaje en correo y WhatsApp (OpenWA / Cloud API).
            </p>
            {draft.imageUrl ? (
              <div className="mb-sm">
                <img
                  src={draft.imageUrl}
                  alt="Vista previa"
                  className="max-h-40 rounded-lg border border-outline-variant"
                />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-sm items-center">
              <label className="inline-flex items-center gap-2 px-md py-2 rounded-lg border border-primary text-primary cursor-pointer hover:bg-primary-fixed">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadImage(file);
                    e.target.value = "";
                  }}
                />
                {uploading ? "Subiendo..." : "Subir imagen"}
              </label>
              {draft.imageUrl ? (
                <Button variant="outline" onClick={() => setDraft({ ...draft, imageUrl: "" })}>
                  Quitar imagen
                </Button>
              ) : null}
            </div>
          </div>

          <div className="bg-white rounded-xl flex-1 flex flex-col shadow-level-1 border border-outline-variant/30 overflow-hidden">
            <div className="p-sm bg-surface-container-low border-b border-outline-variant flex justify-between items-center">
              <label className="text-label-md text-on-surface-variant">
                {channel === "email" ? "CUERPO HTML" : "MENSAJE DE TEXTO"}
              </label>
              <div className="flex gap-xs">
                <button type="button" className="p-xs hover:bg-surface-variant rounded" onClick={() => wrap("b")}>
                  <Icon name="format_bold" className="text-[18px]" />
                </button>
                <button type="button" className="p-xs hover:bg-surface-variant rounded" onClick={() => wrap("i")}>
                  <Icon name="format_italic" className="text-[18px]" />
                </button>
              </div>
            </div>
            <div className="p-md flex-1 flex flex-col">
              {channel === "email" ? (
                <div className="mb-md pb-md border-b border-outline-variant/30">
                  <label className="text-label-md text-on-surface-variant block mb-xs">ASUNTO</label>
                  <input
                    className="w-full p-sm border border-outline-variant rounded-lg outline-none focus:border-primary"
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  />
                </div>
              ) : null}
              <textarea
                className="flex-1 w-full min-h-[240px] resize-y border-none outline-none p-0 text-body-md leading-relaxed font-mono"
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
              <div className="mt-md pt-sm border-t border-outline-variant">
                <p className="text-label-md text-secondary mb-sm">VARIABLES (clic para insertar)</p>
                <div className="flex flex-wrap gap-xs">
                  {TEMPLATE_VARIABLES.filter(
                    (variable) => kind === "special" || variable !== "{special_date_name}",
                  ).map((variable) => (
                    <button
                      key={variable}
                      type="button"
                      onClick={() => insertVariable(variable)}
                      className="px-sm py-xs bg-surface-container rounded-full border border-outline-variant/50 font-mono text-[12px] text-tertiary-container hover:bg-tertiary-container hover:text-white"
                    >
                      {variable}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5">
          <div className="bg-surface-container-highest rounded-xl p-md flex flex-col items-center border border-outline-variant/20 min-h-[600px]">
            {channel === "whatsapp" ? (
              <WhatsAppPreview text={previewBody} imageUrl={draft.imageUrl} />
            ) : (
              <EmailPreview subject={previewSubject} html={previewBody} imageUrl={draft.imageUrl} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WhatsAppPreview({ text, imageUrl }: { text: string; imageUrl?: string }) {
  return (
    <div className="w-[300px] h-[560px] bg-white rounded-[40px] shadow-level-2 border-[8px] border-white overflow-hidden flex flex-col">
      <div className="bg-[#075E54] text-white p-sm flex items-center gap-sm">
        <Icon name="arrow_back" className="text-[18px]" />
        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
          <img src="/logo.png" alt="" className="h-6 w-auto" />
        </div>
        <div className="flex-1">
          <div className="text-[14px] font-semibold leading-tight">HUAV</div>
          <div className="text-[11px] opacity-80">Banco de sangre</div>
        </div>
      </div>
      <div className="flex-1 bg-[#E5DDD5] p-sm overflow-y-auto">
        <div className="bg-white rounded-lg p-sm shadow-sm max-w-[85%]">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="rounded-md mb-2 max-h-32 w-full object-cover" />
          ) : null}
          <div className="text-[14px] whitespace-pre-wrap leading-snug">{text}</div>
          <div className="text-[10px] text-gray-400 text-right mt-1">10:42</div>
        </div>
      </div>
      <div className="bg-[#F0F0F0] p-sm flex items-center gap-sm">
        <div className="bg-white flex-1 rounded-full px-sm py-xs text-gray-400 text-[13px]">Mensaje</div>
        <div className="w-8 h-8 bg-[#128C7E] rounded-full flex items-center justify-center text-white">
          <Icon name="mic" className="text-[16px]" />
        </div>
      </div>
    </div>
  );
}

function EmailPreview({
  subject,
  html,
  imageUrl,
}: {
  subject: string;
  html: string;
  imageUrl?: string;
}) {
  const previewHtml = imageUrl
    ? `<div style="text-align:center;margin-bottom:16px;"><img src="${imageUrl}" alt="" style="max-width:100%;border-radius:8px;" /></div>${html}`
    : html;

  return (
    <div className="w-full max-w-[360px] h-[560px] bg-white rounded-[28px] shadow-level-2 overflow-hidden flex flex-col border-8 border-white">
      <div className="bg-surface-container-low p-sm border-b border-outline-variant flex items-center gap-sm">
        <Icon name="arrow_back" className="text-secondary" />
        <div className="flex-1 text-title-md text-[14px] truncate">Bandeja</div>
      </div>
      <div className="p-md border-b border-outline-variant/30">
        <h2 className="text-[16px] font-semibold mb-sm">{subject}</h2>
        <div className="flex items-center gap-sm">
          <div className="w-8 h-8 rounded-full bg-primary-fixed text-primary font-bold flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="" className="h-6 w-auto" />
          </div>
          <div>
            <div className="text-[14px] font-semibold">HUAV</div>
            <div className="text-[12px] text-secondary">Para: Juan Pérez</div>
          </div>
        </div>
      </div>
      <iframe title="Vista previa del correo" className="flex-1 w-full bg-white" srcDoc={previewHtml} />
    </div>
  );
}
