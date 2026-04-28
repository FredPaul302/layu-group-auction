import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state motion-panel motion-delay-2">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-copy">{description}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
