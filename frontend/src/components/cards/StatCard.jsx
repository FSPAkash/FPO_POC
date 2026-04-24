export function StatCard({ label, value, tone = "normal", helper, badge }) {
  return (
    <article className="stat-card glass-normal">
      <div className="stat-head">
        <p className="stat-label">
          <span className={`stat-dot tone-${tone}`} />
          <span>{label}</span>
        </p>
        {badge ? <span className={`badge badge-${tone}`}>{badge}</span> : null}
      </div>
      <p className="stat-value">{value}</p>
      {helper ? <p className="stat-helper">{helper}</p> : null}
    </article>
  );
}
