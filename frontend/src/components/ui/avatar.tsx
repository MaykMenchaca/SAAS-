import { cn } from "../../lib/cn";

type AvatarProps = {
  className?: string;
  name: string;
  size?: "sm" | "md";
};

const palette = [
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-danger/15 text-danger",
  "bg-info/15 text-info",
  "bg-brand-violet/15 text-brand-violet",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
};

export function Avatar({ className, name, size = "md" }: AvatarProps) {
  const colorClass = palette[hashCode(name) % palette.length];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes[size],
        colorClass,
        className,
      )}
      title={name}
    >
      {initials(name)}
    </span>
  );
}
