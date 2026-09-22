"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { Icon } from "./Icon";

export type WhatsAppQueueItem = {
  donorId: string;
  name: string;
  phone: string;
  url: string;
  message: string;
};

export function WhatsAppQueueModal({
  open,
  items,
  onClose,
  onDone,
}: {
  open: boolean;
  items: WhatsAppQueueItem[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const current = items[index];

  async function markSent(advance: boolean) {
    if (!current) return;
    setBusy(true);
    try {
      await api("/api/reminders/mark-sent", {
        method: "POST",
        body: JSON.stringify({
          donorId: current.donorId,
          channel: "whatsapp",
          status: "enviado",
        }),
      });
      if (advance && index < items.length - 1) {
        setIndex((i) => i + 1);
      } else if (index >= items.length - 1) {
        onDone();
        onClose();
        setIndex(0);
      } else {
        setIndex((i) => i + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (index < items.length - 1) setIndex((i) => i + 1);
    else {
      onDone();
      onClose();
      setIndex(0);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setIndex(0);
        onClose();
      }}
      title="Cola de WhatsApp"
      subtitle="El navegador bloquea ventanas masivas. Abra cada chat, envíe el mensaje y márquelo como enviado."
    >
      {!current ? (
        <p className="text-body-md text-secondary">No hay chats pendientes.</p>
      ) : (
        <div className="space-y-md">
          <p className="text-label-md text-secondary uppercase">
            {index + 1} de {items.length}
          </p>
          <div className="rounded-xl border border-outline-variant p-md bg-surface-container-low">
            <p className="text-title-md">{current.name}</p>
            <p className="text-body-sm text-secondary">{current.phone}</p>
            <pre className="mt-sm whitespace-pre-wrap text-body-sm font-sans bg-white p-sm rounded-lg border border-outline-variant">
              {current.message}
            </pre>
          </div>
          <div className="flex flex-wrap gap-sm">
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-md py-2 bg-tertiary-container text-white text-title-md"
            >
              <Icon name="chat" />
              Abrir WhatsApp
            </a>
            <Button onClick={() => void markSent(true)} disabled={busy}>
              Marcar enviado y siguiente
            </Button>
            <Button variant="outline" onClick={skip}>
              Omitir
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
