import { DONATION_TYPE_LABELS, type DonationType } from "@/lib/constants";
import { normalizeDonationType } from "@/lib/donation-intervals";

const TONES: Record<DonationType, string> = {
  total: "bg-surface-container-highest text-on-surface",
  aferesis: "bg-primary-fixed text-on-primary-fixed-variant",
};

export function DonationTypeBadge({ type }: { type: string }) {
  const key = normalizeDonationType(type);
  const label = DONATION_TYPE_LABELS[key];
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-label-md font-medium ${TONES[key]}`}
    >
      {label}
    </span>
  );
}
