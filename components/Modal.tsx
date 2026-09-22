"use client";

import { useEffect } from "react";
import { Icon } from "./Icon";

type ModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
};

export function Modal({ open, title, subtitle, onClose, children, wide }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#111c2d]/40"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full ${wide ? "max-w-4xl" : "max-w-xl"} max-h-[90vh] overflow-y-auto rounded-xl bg-surface-container-lowest shadow-level-2 border border-outline-variant`}
      >
        <div className="flex items-start justify-between gap-md p-md border-b border-secondary-container">
          <div>
            <h2 className="text-title-lg text-on-surface">{title}</h2>
            {subtitle ? (
              <p className="text-body-sm text-secondary mt-1">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-secondary hover:bg-surface-container hover:text-primary"
            aria-label="Cerrar"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="p-md">{children}</div>
      </div>
    </div>
  );
}
