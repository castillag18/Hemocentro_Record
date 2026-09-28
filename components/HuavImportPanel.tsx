"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { alertError, alertSuccess, showLoading, closeLoading } from "@/lib/alerts";
import { Button } from "./Button";
import { Icon } from "./Icon";

type ImportResult = {
  rows: number;
  unique: number;
  created: number;
  updated: number;
  skipped: number;
  sqlFile: string;
};

export function HuavImportPanel({ onImported }: { onImported?: () => void }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runImport() {
    setLoading(true);
    setResult(null);
    showLoading("Importando donantes desde HUAV...");
    try {
      const data = await api<ImportResult & { ok: boolean }>("/api/donors/import-huav", {
        method: "POST",
      });
      setResult(data);
      void alertSuccess(
        "Importación completada",
        `${data.unique} donantes únicos (${data.created} nuevos, ${data.updated} actualizados).`,
      );
      onImported?.();
    } catch (err) {
      void alertError("Error", err instanceof Error ? err.message : "No se pudo importar");
    } finally {
      setLoading(false);
      closeLoading();
    }
  }

  return (
    <div className="rounded-lg border border-secondary-container bg-surface-container-low p-md space-y-md">
      <div className="flex items-start gap-3">
        <Icon name="database" className="text-primary text-[28px] shrink-0" />
        <div>
          <h4 className="text-title-md">Importar desde BD HUAV</h4>
          <p className="text-body-sm text-secondary mt-1">
            Lee <code>donantes_info.sql</code> contra MySQL HUAV (<code>HUAV_DB_*</code> en .env)
            e inserta o actualiza donantes en esta app. Reemplace los 5 registros de prueba del seed.
          </p>
        </div>
      </div>
      <Button onClick={() => void runImport()} disabled={loading}>
        <Icon name="sync" /> {loading ? "Importando..." : "Importar donantes HUAV"}
      </Button>
      {result ? (
        <p className="text-body-sm text-tertiary-container">
          {result.sqlFile}: {result.rows} filas → {result.unique} únicos ({result.created} creados,{" "}
          {result.updated} actualizados, {result.skipped} omitidos).
        </p>
      ) : null}
    </div>
  );
}
