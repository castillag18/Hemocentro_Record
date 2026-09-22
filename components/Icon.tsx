type IconProps = {
  name: string;
  filled?: boolean;
  className?: string;
};

export function Icon({ name, filled, className = "" }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${filled ? "fill-icon" : ""} ${className}`}
      aria-hidden
    >
      {name}
    </span>
  );
}
