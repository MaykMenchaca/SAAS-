import { cn } from "../../lib/cn";

type AvatarProps = {
  className?: string;
  name: string;
  size?: "sm" | "md";
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizes = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
};

/** Avatar Industry: cuadrado de línea fina con las iniciales en la tipografía de títulos (sin colores por usuario). */
export function Avatar({ className, name, size = "md" }: AvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-divider font-heading font-semibold text-text",
        sizes[size],
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
