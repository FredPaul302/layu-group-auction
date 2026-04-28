import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta
}: PageHeaderProps) {
  return (
    <section className="page-header motion-section motion-delay-1">
      <div className="page-header-row">
        <div className="section-header">
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="page-title">{title}</h2>
          {description ? <div className="page-copy">{description}</div> : null}
        </div>
        {actions ? <div className="page-header-actions motion-panel motion-delay-2">{actions}</div> : null}
      </div>
      {meta ? <div className="metric-grid motion-panel motion-delay-2">{meta}</div> : null}
    </section>
  );
}
