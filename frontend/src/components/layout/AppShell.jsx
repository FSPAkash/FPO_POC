import { useState } from "react";
import { NAV_ITEMS } from "../../theme";

export function AppShell({
  active,
  onActiveChange,
  onReseed,
  seedInput,
  onSeedInput,
  dataProfile,
  dataProfiles,
  onDataProfileChange,
  generatedAt,
  role,
  roles,
  onRoleChange,
  canReseed,
  children
}) {
  const [navCollapsed, setNavCollapsed] = useState(false);
  const generatedLabel = generatedAt ? new Date(generatedAt).toLocaleString() : "Loading...";

  return (
    <div className="app-root" data-section={active}>
      <div className="app-shell-frame">
        <header className="top-bar glass-strong">
          <div className="brand-wrap">
            <button
              type="button"
              className="nav-collapse-btn"
              onClick={() => setNavCollapsed((value) => !value)}
              title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span>{navCollapsed ? ">" : "<"}</span>
            </button>
            <div className="brand-avatar">F</div>
            <p className="brand-title">FPO Integrated OS</p>
          </div>

          <div className="top-actions">
            <label className="meta-pill seed-meta">
              <span className="meta-label">Seed</span>
              <input value={seedInput} onChange={(event) => onSeedInput(event.target.value)} disabled={!canReseed} aria-label="Demo seed" />
            </label>
            <label className="meta-pill mode-meta">
              <span className="meta-label">Mode</span>
              <select value={dataProfile} onChange={(event) => onDataProfileChange(event.target.value)} disabled={!canReseed} aria-label="Dataset mode">
                {(dataProfiles || []).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="meta-pill generated-meta" title={generatedLabel}>
              <span className="meta-label">Generated</span>
              <span className="meta-value">{generatedLabel}</span>
            </div>
            <label className="role-switch-wrap">
              <span>Role</span>
              <select value={role} onChange={(event) => onRoleChange(event.target.value)}>
                {(roles || []).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-primary btn-small" onClick={onReseed} disabled={!canReseed}>
              Reseed
            </button>
          </div>
        </header>

        <div className={`main-layout ${navCollapsed ? "nav-collapsed" : ""}`}>
          <aside className="left-nav glass-normal">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${active === item.id ? "active" : ""} ${navCollapsed ? "nav-item-icon" : ""}`}
                onClick={() => onActiveChange(item.id)}
                title={navCollapsed ? item.label : undefined}
              >
                <span className="nav-glyph">{item.glyph || item.label.slice(0, 2)}</span>
                {!navCollapsed ? <span className="nav-label">{item.label}</span> : null}
              </button>
            ))}
          </aside>
          <main className="content-wrap">{children}</main>
        </div>
      </div>
    </div>
  );
}
