"use client";

export function Spinner({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const dim = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  return (
    <span
      className={`inline-block ${dim} animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      role="status"
      aria-label="Cargando"
    />
  );
}

export function LoadingOverlay({ message = "Cargando..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
      <div className="bg-white rounded-xl shadow-level-2 px-lg py-md flex items-center gap-sm border border-outline-variant">
        <Spinner size="lg" className="text-primary" />
        <span className="text-body-md text-secondary">{message}</span>
      </div>
    </div>
  );
}
