const TONES: Record<string, string> = {
  "O+": "bg-primary-fixed text-on-primary-fixed-variant",
  "O-": "bg-primary-fixed text-on-primary-fixed-variant",
  "A+": "bg-surface-container-highest text-on-surface",
  "A-": "bg-[#E0E7FF] text-[#3730A3]",
  "B+": "bg-primary-fixed text-on-primary-fixed-variant",
  "B-": "bg-surface-container-highest text-on-surface",
  "AB+": "bg-[#FCE7F3] text-[#9D174D]",
  "AB-": "bg-primary-fixed text-on-primary-fixed-variant",
};

export function BloodTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded font-mono text-mono-md font-bold ${TONES[type] ?? "bg-surface-container text-on-surface"}`}
    >
      {type}
    </span>
  );
}
