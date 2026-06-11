import type { ReactNode } from "react";

import { EmptyStateGraphic, type MotifVariant } from "@/components/visual/auction-graphics";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  motif?: MotifVariant;
};

export function EmptyState({
  title,
  description,
  action,
  motif = "neutral"
}: EmptyStateProps) {
  return (
    <div className="empty-state motion-panel motion-delay-2">
      <EmptyStateGraphic motif={motif} />
      <div className="space-y-1">
        <p className="empty-state-title">{title}</p>
        <p className="empty-state-copy">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
