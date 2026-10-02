"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { alertError, alertSuccess, showLoading, closeLoading } from "@/lib/alerts";
import { Button } from "./Button";
import { Icon } from "./Icon";

type ImportResult = {
  mode?: string;
  rows: number;
  unique: number;
  created: number;
  updated: number;
  unchanged?: number;
  skipped: number;
  sqlFile: string;
};

export function HuavImportPanel({ onImported }: { onImported?: () => void }) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function runImport(full: boolean) {
    setLoading(true);
    setResult(null);
    showLoading(full ? "Importación completa HUAV..." : "Sincronizando donantes (cambios recientes)...");
    try {
      const query = full ? "?full=1" : "";
      const data = await api<ImportResult & { ok: boolean }>(`/api/donors/import-huav${query}`, {
        method: "POST",
      });
      setResult(data);
      const unchanged = data.unchanged ?? 0;
      void alertSuccess(
        "Importación completada",
        `${data.unique} donantes en consulta · ${data.created} nuevos · ${data.updated} actualizados · ${unchanged} sin cambios.`,
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
            <strong>Sincronizar (recomendado):</strong> usa <code>donantes_info_nightly.sql</code> (donaciones
            recientes) e inserta o actualiza solo donantes nuevos o con datos distintos.
            <br />
            <strong>Completa:</strong> recorre toda la consulta <code>donantes_info.sql</code> (mucho más lenta).
            El cron del servidor corre la sincronización a las 3:00 AM.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void runImport(false)} disabled={loading}>
          <Icon name="sync" /> {loading ? "Importando..." : "Sincronizar donantes"}
        </Button>
        <Button variant="outline" onClick={() => void runImport(true)} disabled={loading}>
          Importación completa
        </Button>
      </div>
      {result ? (
        <p className="text-body-sm text-tertiary-container">
          {result.mode === "full" ? "Completa" : "Incremental"} · {result.sqlFile}: {result.rows} filas →{" "}
          {result.unique} únicos ({result.created} creados, {result.updated} actualizados
          {result.unchanged != null ? `, ${result.unchanged} sin cambios` : ""}, {result.skipped} omitidos).
        </p>
      ) : null}
    </div>
  );
}
