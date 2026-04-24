export function SectionPanel({ title, subtitle, children, actions }) {
  return (
    <section className="section-panel">
      {title || subtitle || actions ? (
        <div className="section-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="section-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
