"use client";

import { Button } from "./Button";
import { Icon } from "./Icon";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  hasMore,
  totalExact = true,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  hasMore?: boolean;
  totalExact?: boolean;
}) {
  const from = total === 0 && !hasMore ? 0 : (page - 1) * pageSize + 1;
  const to = totalExact ? Math.min(page * pageSize, total) : (page - 1) * pageSize + pageSize;

  const summary = (() => {
    if (total === 0 && !hasMore) return "Sin resultados";
    if (totalExact && total > 0) return `Mostrando ${from}–${to} de ${total.toLocaleString("es-CO")}`;
    if (hasMore) return `Mostrando ${from}–${to} (hay más resultados)`;
    return `Mostrando ${from}–${to}`;
  })();

  return (
    <div className="px-md py-sm border-t border-outline-variant flex flex-wrap items-center justify-between gap-sm">
      <span className="text-body-sm text-secondary">{summary}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          className="!px-2 !py-1"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <Icon name="chevron_left" />
        </Button>
        <span className="px-3 py-1 text-body-sm">
          {totalExact ? `${page} / ${totalPages}` : `Pág. ${page}`}
        </span>
        <Button
          variant="outline"
          className="!px-2 !py-1"
          disabled={totalExact ? page >= totalPages : !hasMore}
          onClick={() => onPageChange(page + 1)}
        >
          <Icon name="chevron_right" />
        </Button>
      </div>
    </div>
  );
}
