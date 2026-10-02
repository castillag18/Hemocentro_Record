"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, initials } from "@/lib/client";
import { formatDate } from "@/lib/dates";
import { BLOOD_TYPES } from "@/lib/constants";
import { BloodTypeBadge } from "@/components/BloodTypeBadge";
import { DonationTypeBadge } from "@/components/DonationTypeBadge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { DonorFormModal, type DonorRecord } from "@/components/DonorFormModal";
import { HuavImportPanel } from "@/components/HuavImportPanel";
import { ImportModal } from "@/components/ImportModal";
import { Pagination } from "@/components/Pagination";
import { LoadingOverlay } from "@/components/Spinner";
import { alertError } from "@/lib/alerts";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type ListResponse = {
  total: number;
  page: number;
  pageSize: number;
  hasMore?: boolean;
  totalExact?: boolean;
  donors: DonorRecord[];
};

export default function DonantesPage() {
  return (
    <Suspense fallback={<p className="text-secondary">Cargando donantes...</p>}>
      <DonantesContent />
    </Suspense>
  );
}

function DonantesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const debouncedQ = useDebouncedValue(q, 400);
  const [bloodType, setBloodType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<ListResponse | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<DonorRecord | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const trimmed = debouncedQ.trim();
    if (trimmed.length === 1) {
      setData({
        total: 0,
        page: 1,
        pageSize,
        hasMore: false,
        totalExact: true,
        donors: [],
      });
      setInitialLoading(false);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({
      q: trimmed,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (bloodType) params.set("bloodType", bloodType);
    setLoading(true);
    try {
      setData(await api<ListResponse>(`/api/donors?${params}`));
    } catch (err) {
      void alertError("Error", err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setInitialLoading(false);
      setLoading(false);
    }
  }, [debouncedQ, bloodType, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("nuevo") === "1") {
      setEditing(null);
      setFormOpen(true);
      router.replace("/donantes");
    }
    const incomingQ = searchParams.get("q");
    if (incomingQ) setQ(incomingQ);
  }, [searchParams, router]);

  const totalExact = data?.totalExact !== false;
  const totalPages = totalExact
    ? Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? pageSize)))
    : page + (data?.hasMore ? 1 : 0);

  return (
    <div>
      {initialLoading && !data ? <LoadingOverlay message="Cargando donantes..." /> : null}
      {loading && data ? <LoadingOverlay message="Actualizando lista..." /> : null}
      {data && data.total <= 10 ? (
        <div className="mb-md">
          <HuavImportPanel onImported={() => void load()} />
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-md mb-lg">
        <div>
          <h2 className="text-display-lg max-md:text-headline-lg">Gestión de donantes</h2>
          <p className="text-body-lg text-secondary mt-xs">
            Consulte, registre e importe la base de donantes
            {data ? ` (${data.total} en total)` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Icon name="upload_file" /> Importar Excel/CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Icon name="add" /> Registrar donante
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant p-md mb-gutter shadow-level-1">
        <div className="flex flex-col lg:flex-row gap-md">
          <div className="flex-1 relative">
            <Icon name="search" className="absolute left-sm top-1/2 -translate-y-1/2 text-secondary" />
            <input
              className="w-full pl-xl pr-sm py-sm border border-outline-variant rounded-lg outline-none focus:border-primary"
              placeholder="Buscar (mín. 2 caracteres): nombre, cédula, teléfono o correo"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>
          <select
            className="border border-outline-variant rounded-lg py-sm px-md bg-white"
            value={bloodType}
            onChange={(e) => {
              setPage(1);
              setBloodType(e.target.value);
            }}
          >
            <option value="">Grupo sanguíneo (todos)</option>
            {BLOOD_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <select
            className="border border-outline-variant rounded-lg py-sm px-md bg-white"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            <option value={25}>25 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-outline-variant overflow-hidden shadow-level-1">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-[#F1F5F9] border-b border-outline-variant">
              <tr>
                <th className="py-sm px-md text-title-md">Nombre</th>
                <th className="py-sm px-md text-title-md">Cédula</th>
                <th className="py-sm px-md text-title-md">Grupo</th>
                <th className="py-sm px-md text-title-md">Donación</th>
                <th className="py-sm px-md text-title-md">Última donación</th>
                <th className="py-sm px-md text-title-md">Contacto</th>
                <th className="py-sm px-md text-title-md text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {(data?.donors ?? []).map((donor) => (
                <tr key={donor.id} className="hover:bg-surface-container group">
                  <td className="py-sm px-md">
                    <div className="flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full bg-surface-container-highest text-primary flex items-center justify-center text-label-md">
                        {initials(donor.name)}
                      </div>
                      <span className="font-medium">{donor.name}</span>
                    </div>
                  </td>
                  <td className="py-sm px-md font-mono text-mono-md text-secondary">{donor.documentId}</td>
                  <td className="py-sm px-md">
                    <BloodTypeBadge type={donor.bloodType} />
                  </td>
                  <td className="py-sm px-md">
                    <DonationTypeBadge type={donor.donationType} />
                  </td>
                  <td className="py-sm px-md text-secondary">{formatDate(donor.lastDonationDate)}</td>
                  <td className="py-sm px-md">
                    <div className="flex flex-col">
                      <span>{donor.phone || "—"}</span>
                      <span className="text-body-sm text-secondary">{donor.email || "—"}</span>
                    </div>
                  </td>
                  <td className="py-sm px-md text-right">
                    <button
                      type="button"
                      className="text-secondary hover:text-primary p-1"
                      onClick={() => {
                        setEditing(donor);
                        setFormOpen(true);
                      }}
                      title="Editar"
                    >
                      <Icon name="edit" />
                    </button>
                  </td>
                </tr>
              ))}
              {!data?.donors.length ? (
                <tr>
                  <td colSpan={7} className="py-lg text-center text-secondary">
                    No hay donantes. Importe un archivo o registre uno nuevo.
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
          pageSize={data?.pageSize ?? pageSize}
          hasMore={data?.hasMore}
          totalExact={totalExact}
          onPageChange={setPage}
        />
      </div>

      <DonorFormModal
        open={formOpen}
        donor={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void load()}
      />
    </div>
  );
}
