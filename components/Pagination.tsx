"use client";

import { Button } from "./Button";
import { Icon } from "./Icon";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="px-md py-sm border-t border-outline-variant flex flex-wrap items-center justify-between gap-sm">
      <span className="text-body-sm text-secondary">
        {total ? `Mostrando ${from}–${to} de ${total}` : "Sin resultados"}
      </span>
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
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          className="!px-2 !py-1"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <Icon name="chevron_right" />
        </Button>
      </div>
    </div>
  );
}
