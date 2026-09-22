import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost" | "danger";

const STYLES: Record<Variant, string> = {
  primary:
    "bg-primary-container text-on-primary hover:opacity-90 shadow-level-1",
  outline:
    "border border-secondary-container bg-surface-container-lowest text-secondary hover:bg-surface-container",
  ghost: "text-secondary hover:bg-surface-container hover:text-primary",
  danger: "bg-error text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-md py-2 text-title-md transition-all disabled:opacity-50 disabled:pointer-events-none ${STYLES[variant]} ${className}`}
      {...props}
    />
  );
}
