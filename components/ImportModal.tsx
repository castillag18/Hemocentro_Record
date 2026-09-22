"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { autoMapColumns } from "@/lib/import-map";
import { Button } from "./Button";
import { Modal } from "./Modal";

const FIELDS = [
  { key: "name", label: "Nombre", required: true },
  { key: "documentId", label: "Cédula / ID (opcional, se genera automático)", required: false },
  { key: "bloodType", label: "Grupo sanguíneo", required: true },
  { key: "lastDonationDate", label: "Última donación", required: true },
  { key: "phone", label: "Teléfono", required: false },
  { key: "email", label: "Correo", required: false },
  { key: "preferredChannel", label: "Canal", required: false },
  { key: "accepted", label: "Aceptado (Sí/No)", required: false },
];

type Result = {
  created: number;
  updated: number;
  unique?: number;
  errors: { row: number; message: string }[];
};

export function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName("");
    setError("");
    setResult(null);
  }

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

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  async function importRows() {
    setLoading(true);
    setError("");
    try {
      const data = await api<Result>("/api/donors/import", {
        method: "POST",
        body: JSON.stringify({ mapping, rows }),
      });
      setResult(data);
      onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo importar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      wide
      title="Importar donantes"
      subtitle="Cargue un Excel o CSV. Si un donante aparece varias veces, se conserva su última fecha de donación."
    >
      <div className="space-y-md">
        <div className="flex flex-wrap gap-sm items-center">
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
          <a
            href="/api/donors/sample"
            className="text-body-sm text-primary hover:underline"
          >
            Descargar plantilla CSV
          </a>
          {fileName ? <span className="text-body-sm text-secondary">{fileName} · {rows.length} filas</span> : null}
        </div>

        {headers.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="text-label-md text-secondary uppercase">
                  {field.label} {field.required ? "*" : ""}
                </span>
                <select
                  className="mt-1 w-full border border-secondary-container rounded-lg p-2 bg-white"
                  value={mapping[field.key] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                >
                  <option value="">— No mapear —</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}

        {preview.length ? (
          <div className="overflow-x-auto border border-outline-variant rounded-lg">
            <table className="w-full text-body-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="text-left p-sm font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr key={idx} className="border-t border-outline-variant">
                    {headers.map((header) => (
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
          <div className="rounded-lg bg-surface-container-low p-sm text-body-sm">
            Creados: <strong>{result.created}</strong> · Actualizados:{" "}
            <strong>{result.updated}</strong>
            {typeof result.unique === "number" ? (
              <>
                {" "}
                · Únicos: <strong>{result.unique}</strong>
              </>
            ) : null}{" "}
            · Errores: <strong>{result.errors.length}</strong>
            {result.errors.slice(0, 5).map((item) => (
              <p key={`${item.row}-${item.message}`} className="text-error mt-1">
                Fila {item.row}: {item.message}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-sm">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cerrar
          </Button>
          <Button onClick={importRows} disabled={!rows.length || loading}>
            {loading ? "Importando..." : "Importar base"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
