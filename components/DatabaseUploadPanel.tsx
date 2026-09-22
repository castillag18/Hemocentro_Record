"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { autoMapColumns } from "@/lib/import-map";
import { Button } from "./Button";

type Result = {
  created: number;
  updated: number;
  unique?: number;
  errors: { row: number; message: string }[];
};

export function DatabaseUploadPanel() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onFile(file: File) {
    setError("");
    setResult(null);
    setFileName(file.name);
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: true,
    });
    if (!json.length) {
      setError("El archivo no tiene filas");
      return;
    }
    const cols = Object.keys(json[0]);
    setHeaders(cols);
    setRows(json);
    setMapping(autoMapColumns(cols));
  }

  const preview = useMemo(() => rows.slice(0, 3), [rows]);

  async function importRows() {
    setLoading(true);
    setError("");
    try {
      const data = await api<Result>("/api/donors/import", {
        method: "POST",
        body: JSON.stringify({ mapping, rows }),
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-md">
      <p className="text-body-sm text-secondary">
        Cargue el plano de donantes (Excel/CSV). Solo se enviarán recordatorios a donantes con
        columna <strong>Aceptado = Sí</strong>.
      </p>
      <label className="inline-flex items-center gap-2 px-md py-2 rounded-lg border border-primary text-primary cursor-pointer hover:bg-primary-fixed">
        <input
          type="file"
          accept=".xlsx,.xls,.csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
        Seleccionar archivo
      </label>
      {fileName ? (
        <p className="text-body-sm text-secondary">
          {fileName} · {rows.length} filas · {Object.keys(mapping).length} columnas mapeadas
        </p>
      ) : null}

      {preview.length ? (
        <div className="overflow-x-auto border border-outline-variant rounded-lg text-body-sm">
          <table className="w-full">
            <thead className="bg-surface-container-low">
              <tr>
                {headers.slice(0, 6).map((header) => (
                  <th key={header} className="text-left p-sm font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, idx) => (
                <tr key={idx} className="border-t border-outline-variant">
                  {headers.slice(0, 6).map((header) => (
                    <td key={header} className="p-sm whitespace-nowrap">
                      {String(row[header] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? <p className="text-body-sm text-error">{error}</p> : null}
      {result ? (
        <p className="text-body-sm text-tertiary-container">
          Creados: {result.created} · Actualizados: {result.updated} · Únicos: {result.unique ?? "—"}{" "}
          · Errores: {result.errors.length}
        </p>
      ) : null}

      <Button onClick={() => void importRows()} disabled={!rows.length || loading}>
        {loading ? "Importando..." : "Importar base de donantes"}
      </Button>
    </div>
  );
}
