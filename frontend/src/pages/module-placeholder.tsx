import type { ReactNode } from "react";

import { Card } from "../components/ui";

type ModulePlaceholderProps = {
  icon: ReactNode;
  title: string;
};

export function ModulePlaceholder({ icon, title }: ModulePlaceholderProps) {
  return (
    <Card className="grid min-h-[280px] place-items-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-neutral-bg text-primary">
          {icon}
        </div>
        <h1 className="text-2xl font-bold text-neutral-text-primary">{title}</h1>
        <p className="mt-2 text-sm text-neutral-text-secondary">En preparacion</p>
      </div>
    </Card>
  );
}
