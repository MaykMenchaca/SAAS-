import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

type BreadcrumbItem = {
  href?: string;
  label: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span className="flex items-center gap-1.5" key={item.label}>
            {idx > 0 ? (
              <ChevronRight aria-hidden="true" className="text-neutral-text-muted" size={14} />
            ) : null}
            {isLast || !item.href ? (
              <span className={isLast ? "font-semibold text-neutral-text-primary" : "text-neutral-text-secondary"}>
                {item.label}
              </span>
            ) : (
              <Link className="text-neutral-text-secondary transition-colors hover:text-primary" to={item.href}>
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
