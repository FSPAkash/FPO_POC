import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { StatCard } from "./components/cards/StatCard";
import { DataTable } from "./components/tables/DataTable";

function currency(value, type = "INR") {
  if (value == null) return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: type,
    maximumFractionDigits: 0
  }).format(num);
}

function number(value, max = 0) {
  const num = Number(value);
  if (Number.isNaN(num)) return "-";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: max }).format(num);
}

function formatDateTime(value) {
  if (!value) return "-";
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return "-";
  return dateValue.toLocaleString();
}

function sliceRows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  return payload.items || [];
}

function sortRowsByNewestId(rows) {
  return [...rows].sort((left, right) => String(right.id || "").localeCompare(String(left.id || ""), undefined, { numeric: true }));
}

function submitAndMaybeClose(result, onClose) {
  Promise.resolve(result).then((value) => {
    if (value !== null && value !== undefined) {
      onClose?.();
    }
  });
}

function toneFromValue(value) {
  const text = String(value || "").toLowerCase();
  if (["high", "pending", "open", "critical", "blocked"].some((item) => text.includes(item))) return "high";
  if (["medium", "warning", "in_progress", "progress"].some((item) => text.includes(item))) return "medium";
  if (["normal", "paid", "approved", "complete", "completed", "resolved", "closed", "active", "received"].some((item) => text.includes(item))) return "normal";
  return "neutral";
}

function isApprovalPending(status) {
  return String(status || "").toLowerCase() === "pending";
}

function isApprovalCleared(status) {
  const value = String(status || "").toLowerCase();
  return value === "approved" || value === "not_required";
}

function approvalSummaryLabel(status) {
  if (isApprovalPending(status)) return "Needs approval";
  if (String(status || "").toLowerCase() === "approved") return "Approved";
  if (String(status || "").toLowerCase() === "not_required") return "No approval needed";
  return "Approval closed";
}

function isPaymentReceived(status) {
  return String(status || "").toLowerCase() === "received";
}

function isSettlementPaid(status) {
  return String(status || "").toLowerCase() === "paid";
}

function hasDispatchForSalesOrder(orderId, dispatches) {
  return (dispatches || []).some((entry) => entry.sales_order_id === orderId);
}

function salesOrderNeedsAttention(order, dispatches) {
  const approvalPending = isApprovalPending(order?.approval_status);
  const paymentPending = !isPaymentReceived(order?.payment_status);
  const dispatchPending = isApprovalCleared(order?.approval_status) && !hasDispatchForSalesOrder(order?.id, dispatches);
  return approvalPending || dispatchPending || paymentPending;
}

function canMarkSalesOrderPaid(order, dispatches) {
  if (!order || isPaymentReceived(order.payment_status)) return false;
  if (!isApprovalCleared(order.approval_status)) return false;
  return hasDispatchForSalesOrder(order.id, dispatches);
}

function canMarkSettlementPaid(settlement, salesOrders) {
  if (!settlement || isSettlementPaid(settlement.payment_status)) return false;
  if (!settlement.sales_order_id) return true;
  const linkedSalesOrder = (salesOrders || []).find((row) => row.id === settlement.sales_order_id);
  if (!linkedSalesOrder) return true;
  if (!isPaymentReceived(linkedSalesOrder.payment_status)) return false;
  return isApprovalCleared(linkedSalesOrder.settlement_release_status || "not_required");
}

function SeverityBadge({ value }) {
  return <span className={`badge badge-${toneFromValue(value)}`}>{String(value || "Neutral").replaceAll("_", " ")}</span>;
}

const INTENT_LABELS = {
  price_query: "Price Query",
  input_request: "Input Request",
  advisory: "Advisory",
  disease_query: "Disease Query",
  harvest_update: "Harvest Update",
  broadcast_ack: "Broadcast Ack"
};

const INTENT_COLORS = {
  price_query: "#1b5e20",
  input_request: "#4caf50",
  advisory: "#6b736b",
  disease_query: "#ef5350",
  harvest_update: "#ff9800",
  broadcast_ack: "#8a928a"
};

function IntentChip({ value }) {
  const label = INTENT_LABELS[value] || value || "General";
  const color = INTENT_COLORS[value] || "#8a928a";
  return (
    <span className="intent-chip" style={{ "--chip-color": color }}>
      {label}
    </span>
  );
}

function Drawer({ open, title, subtitle, onClose, children }) {
  return (
    <aside className={`drawer glass-strong ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p className="drawer-subtitle">{subtitle}</p> : null}
        </div>
        <button type="button" className="btn-ghost btn-icon" onClick={onClose} aria-label={`Close ${title}`}>
          x
        </button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}

function Modal({ open, title, onClose, wide, children }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal-panel ${wide ? "modal-wide" : ""}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="btn-ghost btn-icon" onClick={onClose} aria-label="Close">x</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function TableCard({ title, children, collapsible = false, defaultOpen = true, action }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (collapsible) {
    return (
      <>
        <button type="button" className="table-modal-trigger" onClick={() => setModalOpen(true)}>
          <h3>{title}</h3>
          <div className="content-block-actions">
            {action}
            <span className="trigger-hint">View</span>
          </div>
        </button>
        <Modal open={modalOpen} title={title} onClose={() => setModalOpen(false)} wide>
          {children}
        </Modal>
      </>
    );
  }

  return (
    <section className="content-block">
      <div className="content-block-head">
        <h3>{title}</h3>
        <div className="content-block-actions">{action}</div>
      </div>
      <div className="table-card glass-normal">{children}</div>
    </section>
  );
}

function ProgressBar({ value, max, label }) {
  const ratio = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress-shell">
      <div className="progress-copy">
        <span>{label}</span>
        <span>{value} of {max}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function InlineConfirmAction({ label, confirmLabel = "Confirm...", onConfirm, disabled }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button type="button" className="btn-ghost btn-small" onClick={() => setConfirming(true)} disabled={disabled}>
        {label}
      </button>
    );
  }

  return (
    <div className="inline-confirm">
      <span>{confirmLabel}</span>
      <button type="button" className="btn-primary btn-small" onClick={() => { setConfirming(false); onConfirm(); }}>
        Yes
      </button>
      <button type="button" className="btn-ghost btn-small" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  );
}

function MatchScoreCell({ value }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
  return (
    <div className="match-score-cell">
      <span>{pct}%</span>
      <div className="match-score-track">
        <div className="match-score-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MatchScoreInfoLabel() {
  return (
    <span className="score-header-label">
      <span>Score</span>
      <span
        className="score-info-wrap"
        tabIndex={0}
        role="button"
        aria-label="Score calculation details"
      >
        <span className="score-info-trigger" aria-hidden>
          i
        </span>
        <span className="score-info-popover">
          <strong>match_score = min(0.99, weighted)</strong>
          <br />
          weighted = Qty(32%) + District(14%) + Grade(18%) + Reliability(16%) + Terms(8%) + Margin(12%)
          <br />
          Qty: min(1, available / required)
          <br />
          District: 1.0 if same district, else 0.55
          <br />
          Grade: avg(A=1, B=0.82, C=0.6)
          <br />
          Reliability: buyer_reliability_score / 5
          <br />
          Terms: max(0.25, 1 - payment_terms_days/45)
          <br />
          Margin: clamp((offered_price - base_price + 350)/700, 0..1)
        </span>
      </span>
    </span>
  );
}

function AgentStatusBadge({ agentConfig }) {
  if (!agentConfig) return null;
  const available = agentConfig.agent_available;
  const autoReply = Boolean(agentConfig.agent_auto_reply_enabled);
  return (
    <div className="reply-mode-switch">
      <span className="reply-mode-label">{autoReply ? "Agentic Work" : "Manual Work"}</span>
      <span className="pill-tab active" title={available ? `${agentConfig.agent_provider} / ${agentConfig.agent_model}` : "Using heuristic fallback (no API key)"}>
        {autoReply ? "Auto" : available ? "Assist" : "Fallback"}
      </span>
    </div>
  );
}

function AgentModeNotice({ agentConfig }) {
  if (!agentConfig) return null;
  if (!agentConfig.agent_auto_reply_enabled) {
    return <p className="agent-mode-note">Manual data profile is active. Farmer messages stay in the board until the office replies or explicitly asks the agent to assist.</p>;
  }
  if (!agentConfig.agent_available) {
    return <p className="agent-mode-note">Agent auto-replies every farmer message. `OPENAI_API_KEY` not set - running heuristic fallback; unclear messages auto-escalate.</p>;
  }
  return <p className="agent-mode-note">Agent auto-replies every farmer message ({agentConfig.agent_provider} / {agentConfig.agent_model}). Only escalations appear on the Ticket Board.</p>;
}

export function renderSectionView(active, sectionData, handlers) {
  if (!sectionData) {
    return <div className="empty-section glass-light">No data loaded yet for this section.</div>;
  }

  switch (active) {
    case "command":
      return <CommandCenterSection sectionData={sectionData} handlers={handlers} />;
    case "walkthrough":
      return <WalkthroughSection sectionData={sectionData} handlers={handlers} />;
    case "whatsapp":
      return <WhatsAppDemoSectionV2 sectionData={sectionData} handlers={handlers} />;
    case "dashboard":
      return <DashboardSection sectionData={sectionData} />;
    case "registry":
      return <RegistrySection sectionData={sectionData} handlers={handlers} />;
    case "operations":
      return <OperationsSection sectionData={sectionData} handlers={handlers} />;
    case "market":
      return <MarketSection sectionData={sectionData} handlers={handlers} />;
    case "communication":
      return <CommunicationSection sectionData={sectionData} handlers={handlers} />;
    case "governance":
      return <GovernanceSection sectionData={sectionData} handlers={handlers} />;
    case "carbon":
      return <CarbonSection sectionData={sectionData} handlers={handlers} />;
    case "reports":
      return <ReportsSection sectionData={sectionData} handlers={handlers} />;
    default:
      return null;
  }
}

function DashboardSection({ sectionData }) {
  const headline = sectionData.headline || {};
  const pendingSettlements = Number(headline.settlements_pending || 0);
  const openDemands = Number(headline.input_demands_open || 0);
  const openBuyerOrders = Number(headline.buyer_orders_open || 0);
  return (
    <div className="stack">
      <div className="stat-grid dashboard-stat-grid">
        <StatCard label="Total FPOs" value={number(headline.total_fpos)} />
        <StatCard label="Total Farmers" value={number(headline.total_farmers)} />
        <StatCard label="Input Demands Open" value={number(openDemands)} tone={openDemands > 0 ? "medium" : "normal"} />
        <StatCard label="Buyer Orders Open" value={number(openBuyerOrders)} tone={openBuyerOrders > 0 ? "medium" : "normal"} />
        <StatCard label="Settlements Pending" value={number(pendingSettlements)} tone={pendingSettlements > 0 ? "high" : "normal"} />
        <StatCard label="Carbon Credits Est." value={number(headline.carbon_estimated_credits, 2)} />
        <StatCard label="Carbon Revenue Est." value={currency(headline.carbon_estimated_revenue_usd)} helper="Simulated — based on practice data" />
      </div>

      <div className="equal-grid">
        <TableCard title="Crop Distribution">
          <DataTable
            columns={[
              { key: "crop", label: "Crop" },
              { key: "farmers", label: "Farmers", render: (value) => number(value) },
              { key: "area_ha", label: "Area (ha)", render: (value) => number(value, 1) }
            ]}
            rows={sectionData.crop_mix || []}
          />
        </TableCard>
        <TableCard title="Latest Mandi Price Signals">
          <DataTable
            columns={[
              { key: "crop", label: "Crop" },
              { key: "mandi", label: "Market" },
              { key: "price_avg", label: "Avg Price", render: (value) => currency(value) },
              { key: "price_band", label: "Band" },
              { key: "date", label: "Date" }
            ]}
            rows={sectionData.top_prices || []}
          />
        </TableCard>
      </div>
    </div>
  );
}

const AGENT_LAYOUT = {
  agent_intake:      { order: 0, color: "#388E3C", short: "Intake",      role: "Routes farmer asks" },
  agent_fulfillment: { order: 1, color: "#4CAF50", short: "Fulfillment", role: "Stock + procurement" },
  agent_crop_cycle:  { order: 2, color: "#FFA726", short: "Crop Cycle",  role: "Seasons + harvest" },
  agent_market:      { order: 3, color: "#1B5E20", short: "Market",      role: "Buyer match + dispatch" },
  agent_exception:   { order: 4, color: "#EF5350", short: "Handoff",     role: "Human handoff" },
};

const STATUS_LABEL = { active: "Active", busy: "Busy", waiting: "Waiting", idle: "Idle" };
const STATUS_TONE  = { active: "#17b897", busy: "#f5a524", waiting: "#6b7280", idle: "#94a3b8" };

function ageLabel(sec) {
  if (sec == null) return "no activity yet";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function compactDateTime(value) {
  if (!value) return "No timestamp";
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return "No timestamp";
  return dateValue.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function agentStatusCopy(status) {
  switch (status) {
    case "active":
      return "Working now";
    case "busy":
      return "Queue building";
    case "waiting":
      return "Monitoring";
    default:
      return "On standby";
  }
}

function PersonIcon({ color, pulsing }) {
  return (
    <svg viewBox="0 0 64 72" className="person-svg" aria-hidden>
      {pulsing && <circle cx="32" cy="36" r="30" fill={color} opacity="0.14" className="person-pulse" />}
      <circle cx="32" cy="20" r="11" fill={color} />
      <path d="M 10 66 C 10 48, 54 48, 54 66 L 54 72 L 10 72 Z" fill={color} />
      <circle cx="32" cy="20" r="11" fill="none" stroke="#ffffff" strokeWidth="1.5" opacity="0.6" />
      <path d="M 26 18 Q 32 22 38 18" stroke="#ffffff" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

function taskHeadline(task, fallback) {
  if (!task) return fallback;
  return task.title || task.detail || fallback;
}

function taskDetail(task, fallback) {
  if (!task) return fallback;
  return task.detail || fallback;
}

function queueSnippet(type, row, fallback) {
  if (!row) return fallback;
  if (type === "fulfillment") {
    return `${row.farmer_name} · ${row.item_name} · ${row.next_action}`;
  }
  if (type === "harvest") {
    return `${row.farmer_name} · ${row.crop} · ${row.next_action}`;
  }
  if (type === "market") {
    return `${row.crop} · ${number(row.available_mt, 1)} MT · ${row.best_buyer || row.next_action}`;
  }
  return fallback;
}

function buildInteractionRows(flow, exceptions, fulfillmentQueue, harvestWatchlist, marketQueue) {
  const edges = flow?.edges || [];
  const activity = flow?.per_agent_activity || {};
  const edgeMap = Object.fromEntries(edges.map((edge) => [`${edge.from}->${edge.to}`, edge]));
  const countFor = (from, to) => Number(edgeMap[`${from}->${to}`]?.count || 0);
  const topException = exceptions[0];
  const approvalException = exceptions.find((row) => String(row.type || "").toLowerCase().includes("approval"));
  const lowConfidenceException = exceptions.find((row) => String(row.type || "").toLowerCase().includes("low confidence"));
  const escalationException = exceptions.find((row) => String(row.type || "").toLowerCase().includes("escalation"));

  const routes = [
    {
      id: "intake_fulfillment",
      from: "agent_intake",
      to: "agent_fulfillment",
      label: "Input requests",
      count: countFor("agent_intake", "agent_fulfillment"),
      note: queueSnippet("fulfillment", fulfillmentQueue[0], taskHeadline(activity.agent_fulfillment?.current, "No live input demand")),
    },
    {
      id: "intake_crop_cycle",
      from: "agent_intake",
      to: "agent_crop_cycle",
      label: "Harvest + advisory",
      count: countFor("agent_intake", "agent_crop_cycle"),
      note: queueSnippet("harvest", harvestWatchlist[0], taskHeadline(activity.agent_crop_cycle?.current, "Watching crop timelines")),
    },
    {
      id: "crop_cycle_market",
      from: "agent_crop_cycle",
      to: "agent_market",
      label: "Collections",
      count: countFor("agent_crop_cycle", "agent_market"),
      note: queueSnippet("market", marketQueue[0], taskHeadline(activity.agent_market?.current, "No collection waiting for market action")),
    },
  ];

  const humanRoutes = [
    {
      id: "intake_exception",
      from: "agent_intake",
      to: "agent_exception",
      label: "Low-confidence handoff",
      count: countFor("agent_intake", "agent_exception"),
      note: lowConfidenceException?.reason || topException?.reason || "No intake handoff waiting",
    },
    {
      id: "fulfillment_exception",
      from: "agent_fulfillment",
      to: "agent_exception",
      label: "Approval needed",
      count: countFor("agent_fulfillment", "agent_exception"),
      note: approvalException?.reason || topException?.reason || "No fulfillment approval waiting",
    },
    {
      id: "market_exception",
      from: "agent_market",
      to: "agent_exception",
      label: "Market escalation",
      count: countFor("agent_market", "agent_exception"),
      note: escalationException?.reason || topException?.reason || "No market escalation waiting",
    },
  ]
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 2);

  if (!humanRoutes.length) {
    humanRoutes.push({
      id: "intake_exception",
      from: "agent_intake",
      to: "agent_exception",
      label: "Low-confidence handoff",
      count: countFor("agent_intake", "agent_exception"),
      note: lowConfidenceException?.reason || "No human handoff waiting",
    });
  }

  return [...routes, ...humanRoutes];
}

function CommandAgentCard({ node, activity }) {
  const meta = AGENT_LAYOUT[node.id] || { color: "#64748b", short: node.id, role: "" };
  const status = activity?.status || "idle";
  const pulsing = status === "active";
  const current = activity?.current;
  return (
    <article className="cmd-agent-card glass-normal" style={{ "--agent-color": meta.color }}>
      <div className="cmd-agent-top">
        <div className="cmd-agent-avatar">
          <PersonIcon color={meta.color} pulsing={pulsing} />
          <span className="agent-status-dot" style={{ background: STATUS_TONE[status] }} />
        </div>
        <div className="cmd-agent-copy">
          <div className="cmd-agent-name">{meta.short}</div>
          <div className="cmd-agent-role">{meta.role}</div>
        </div>
        <span className="cmd-agent-state" style={{ color: STATUS_TONE[status] }}>{agentStatusCopy(status)}</span>
      </div>
      <div className="cmd-agent-task">{taskHeadline(current, "Watching queue")}</div>
      <div className="cmd-agent-detail">{taskDetail(current, node.focus || meta.role)}</div>
      <div className="cmd-agent-meta">
        <span>{number(node.completed)} done</span>
        <span>{number(node.pending)} pending</span>
        <span>{ageLabel(activity?.last_activity_seconds_ago)}</span>
      </div>
    </article>
  );
}

function InteractionTrack({ row, index }) {
  const fromMeta = AGENT_LAYOUT[row.from] || { color: "#64748b", short: row.from, role: "" };
  const toMeta = AGENT_LAYOUT[row.to] || { color: "#64748b", short: row.to, role: "" };
  const duration = `${Math.max(3.4, 7 - Math.min(row.count || 0, 4) * 0.6)}s`;
  const signalCount = row.count > 6 ? 3 : row.count > 1 ? 2 : row.count > 0 ? 1 : 0;
  return (
    <article className={`cmd-track-row${row.count > 0 ? " is-active" : ""}`}>
      <div className="cmd-track-person">
        <div className="cmd-track-avatar">
          <PersonIcon color={fromMeta.color} pulsing={row.count > 0} />
        </div>
        <div className="cmd-track-person-copy">
          <div className="cmd-track-person-name">{fromMeta.short}</div>
          <div className="cmd-track-person-role">{fromMeta.role}</div>
        </div>
      </div>
      <div className="cmd-track-center">
        <div className="cmd-track-bubble">
          <span className="cmd-track-topic">{row.label}</span>
          <span className="cmd-track-note">{row.note}</span>
        </div>
        <div className="cmd-track-rail">
          <span className="cmd-track-line" />
          {Array.from({ length: signalCount }).map((_, signalIndex) => (
            <span
              key={`${row.from}-${row.to}-signal-${signalIndex}`}
              className="cmd-track-signal"
              style={{
                "--signal-color": fromMeta.color,
                "--signal-duration": duration,
                "--signal-delay": `${index * 0.45 + signalIndex * 1.3}s`
              }}
            >
              <span />
              <span />
              <span />
            </span>
          ))}
          <span className={`cmd-track-count${row.count > 0 ? " is-active" : ""}`}>{number(row.count)}</span>
        </div>
      </div>
      <div className="cmd-track-person cmd-track-person-end">
        <div className="cmd-track-avatar">
          <PersonIcon color={toMeta.color} pulsing={false} />
        </div>
        <div className="cmd-track-person-copy">
          <div className="cmd-track-person-name">{toMeta.short}</div>
          <div className="cmd-track-person-role">{toMeta.role}</div>
        </div>
      </div>
    </article>
  );
}

const CONVERSATION_NODE_LAYOUT = {
  agent_intake: { x: 155, y: 170 },
  agent_fulfillment: { x: 825, y: 110 },
  agent_crop_cycle: { x: 395, y: 265 },
  agent_market: { x: 815, y: 255 },
  agent_exception: { x: 670, y: 345 },
};

const CONVERSATION_PATHS = {
  intake_fulfillment: "M 205 152 C 360 90, 610 82, 780 108",
  intake_crop_cycle: "M 198 183 C 265 228, 326 250, 358 258",
  crop_cycle_market: "M 440 260 C 555 238, 658 232, 765 247",
  intake_exception: "M 192 190 C 295 286, 455 356, 620 343",
  fulfillment_exception: "M 792 126 C 785 218, 738 296, 695 334",
  market_exception: "M 780 270 C 752 306, 720 329, 694 339",
};

function routeSignalCount(count) {
  if (count > 12) return 3;
  if (count > 2) return 2;
  if (count > 0) return 1;
  return 0;
}

function CommandConversationMap({ routes, activityMap }) {
  const [activeRouteId, setActiveRouteId] = useState(routes.find((row) => row.count > 0)?.id || routes[0]?.id || "");
  const [hoveredAgent, setHoveredAgent] = useState("");

  useEffect(() => {
    if (!routes.length) {
      setActiveRouteId("");
      return;
    }
    if (!routes.some((row) => row.id === activeRouteId)) {
      setActiveRouteId(routes.find((row) => row.count > 0)?.id || routes[0].id);
    }
  }, [routes, activeRouteId]);

  const activeRoute = routes.find((row) => row.id === activeRouteId) || routes[0] || null;
  function pickRouteForAgent(agentId) {
    const preferred = routes.find((row) => row.from === agentId && row.count > 0)
      || routes.find((row) => row.to === agentId && row.count > 0)
      || routes.find((row) => row.from === agentId || row.to === agentId);
    if (preferred) setActiveRouteId(preferred.id);
  }

  return (
    <div className="cmd-convo-map">
      <div className="cmd-convo-stage">
        <svg viewBox="0 0 1000 420" className="cmd-convo-svg" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <defs>
            <linearGradient id="cmdConvoWash" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.96)" />
              <stop offset="100%" stopColor="rgba(244,248,244,0.9)" />
            </linearGradient>
            <pattern id="cmdConvoGrid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(27, 94, 32, 0.035)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="1000" height="420" fill="url(#cmdConvoWash)" />
          <rect x="0" y="0" width="1000" height="420" fill="url(#cmdConvoGrid)" opacity="0.7" />

          {routes.map((row, index) => {
            const fromMeta = AGENT_LAYOUT[row.from] || { color: "#64748b", short: row.from };
            const path = CONVERSATION_PATHS[row.id];
            const isActive = row.id === activeRouteId;
            const isLinked = hoveredAgent ? (row.from === hoveredAgent || row.to === hoveredAgent) : false;
            const isDimmed = hoveredAgent ? !isLinked : false;
            const signalCount = routeSignalCount(row.count);
            return (
              <g key={row.id} className={`cmd-convo-edge${isActive ? " is-active" : ""}${isDimmed ? " is-dimmed" : ""}`}>
                <path
                  d={path}
                  className="cmd-convo-edge-back"
                  stroke={fromMeta.color}
                  strokeWidth={isActive ? "7" : "4"}
                  opacity={row.count > 0 ? (isActive ? "0.22" : "0.1") : "0.05"}
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d={path}
                  className="cmd-convo-edge-line"
                  stroke={row.count > 0 ? fromMeta.color : "rgba(27, 94, 32, 0.18)"}
                  strokeWidth={isActive ? "2.8" : "1.8"}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={row.count > 0 ? "6 9" : "4 12"}
                  opacity={row.count > 0 ? (isActive ? "0.9" : "0.55") : "0.45"}
                />
                <path
                  d={path}
                  className="cmd-convo-edge-hit"
                  onMouseEnter={() => setActiveRouteId(row.id)}
                  onClick={() => setActiveRouteId(row.id)}
                />
                {Array.from({ length: signalCount }).map((_, signalIndex) => (
                  <g key={`${row.id}-pulse-${signalIndex}`} className={isDimmed ? "cmd-convo-pulse is-dimmed" : "cmd-convo-pulse"}>
                    <circle r={isActive ? "6.5" : "5.5"} fill={fromMeta.color} opacity={isActive ? "1" : "0.85"}>
                      <animateMotion
                        dur={`${Math.max(3.8, 7.2 - Math.min(row.count || 0, 8) * 0.22)}s`}
                        begin={`${index * 0.55 + signalIndex * 1.4}s`}
                        repeatCount="indefinite"
                        path={path}
                      />
                    </circle>
                    <circle r={isActive ? "12" : "10"} fill={fromMeta.color} opacity="0.12">
                      <animateMotion
                        dur={`${Math.max(3.8, 7.2 - Math.min(row.count || 0, 8) * 0.22)}s`}
                        begin={`${index * 0.55 + signalIndex * 1.4}s`}
                        repeatCount="indefinite"
                        path={path}
                      />
                    </circle>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>

        {Object.entries(CONVERSATION_NODE_LAYOUT).map(([agentId, pos]) => {
          const meta = AGENT_LAYOUT[agentId] || { color: "#64748b", short: agentId, role: "" };
          const activity = activityMap?.[agentId];
          const status = activity?.status || "idle";
          const linkedCount = routes.filter((row) => row.from === agentId || row.to === agentId).reduce((sum, row) => sum + Number(row.count || 0), 0);
          const isFocused = hoveredAgent === agentId || activeRoute?.from === agentId || activeRoute?.to === agentId;
          return (
            <button
              key={agentId}
              type="button"
              className={`cmd-convo-agent${isFocused ? " is-focused" : ""}`}
              style={{ left: `${pos.x / 10}%`, top: `${pos.y / 4.2}%`, "--agent-color": meta.color }}
              onMouseEnter={() => setHoveredAgent(agentId)}
              onMouseLeave={() => setHoveredAgent("")}
              onFocus={() => setHoveredAgent(agentId)}
              onBlur={() => setHoveredAgent("")}
              onClick={() => pickRouteForAgent(agentId)}
            >
              <div className="cmd-convo-agent-avatar">
                <PersonIcon color={meta.color} pulsing={status === "active"} />
                <span className="cmd-convo-agent-status" style={{ background: STATUS_TONE[status] }} />
              </div>
              <div className="cmd-convo-agent-copy">
                <div className="cmd-convo-agent-name">{meta.short}</div>
                <div className="cmd-convo-agent-role">{meta.role}</div>
              </div>
              <span className="cmd-convo-agent-load">{number(linkedCount)}</span>
            </button>
          );
        })}

        {activeRoute ? (
          <div className="cmd-convo-focus glass-strong">
            <div className="cmd-convo-focus-top">
              <span className="cmd-convo-focus-kicker">{activeRoute.label}</span>
              <span className={`cmd-convo-focus-count${activeRoute.count > 0 ? " is-active" : ""}`}>{number(activeRoute.count)}</span>
            </div>
            <div className="cmd-convo-focus-note">{activeRoute.note}</div>
            <div className="cmd-convo-focus-meta">
              <span>{AGENT_LAYOUT[activeRoute.from]?.short} to {AGENT_LAYOUT[activeRoute.to]?.short}</span>
              <span>{activeRoute.count > 0 ? "Live traffic" : "Monitoring path"}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PulseFeed({ tasks }) {
  if (!tasks || !tasks.length) {
    return <div className="ticker-empty">No recent agent activity.</div>;
  }
  return (
    <div className="cmd-pulse-feed">
      {tasks.map((t) => {
        const color = AGENT_LAYOUT[t.agent_id]?.color || "#64748b";
        return (
          <div key={t.id} className="cmd-pulse-row">
            <span className="ticker-dot" style={{ background: color }} />
            <div className="cmd-pulse-copy">
              <div className="cmd-pulse-title">
                <span className="ticker-agent">{t.agent_name}</span>
                <span className="ticker-title">{t.title}</span>
              </div>
              <div className="ticker-detail">{t.detail}</div>
            </div>
            <span className="ticker-time">{compactDateTime(t.created_at)}</span>
          </div>
        );
      })}
    </div>
  );
}

const WALK_ACTORS = [
  { id: "farmer",            label: "Farmer",       sub: "WhatsApp",         x: 55,  y: 140, kind: "person", color: "#0ea5e9" },
  { id: "agent_intake",      label: "Intake",       sub: "Routes asks",      x: 170, y: 140, kind: "agent",  color: "#388E3C" },
  { id: "agent_fulfillment", label: "Fulfillment",  sub: "Stock + PR",       x: 300, y: 55,  kind: "agent",  color: "#4CAF50" },
  { id: "agent_crop_cycle",  label: "Crop Cycle",   sub: "Seasons",          x: 300, y: 225, kind: "agent",  color: "#FFA726" },
  { id: "agent_exception",   label: "Handoff",      sub: "Human handoff",    x: 430, y: 140, kind: "agent",  color: "#EF5350" },
  { id: "fpo_staff",         label: "FPO Staff",    sub: "Approves",         x: 560, y: 140, kind: "person", color: "#7c3aed" },
  { id: "agent_market",      label: "Market",       sub: "Buyer + dispatch", x: 685, y: 140, kind: "agent",  color: "#1B5E20" },
];

const WALK_ACTOR_BY_ID = Object.fromEntries(WALK_ACTORS.map((a) => [a.id, a]));

const ENTITY_LABEL = {
  message: "message",
  input_issue: "input issue",
  purchase_request: "purchase request",
  goods_receipt: "goods receipt",
  produce_collection: "produce collection",
  crop_season: "crop season",
  sales_order: "sales order",
  dispatch: "dispatch",
  buyer_demand: "buyer demand",
  agent_alert: "alert",
};

function inferFromActor(ev) {
  const agent = ev.agent_id;
  if (agent === "agent_intake") return "farmer";
  if (agent === "agent_exception") return "agent_fulfillment";
  if (agent === "agent_fulfillment") return "agent_intake";
  if (agent === "agent_crop_cycle") return "agent_intake";
  if (agent === "agent_market") return "fpo_staff";
  return "farmer";
}

function inferToActor(ev) {
  if (ev.requires_human) return "fpo_staff";
  if (ev.kind === "alert") return "agent_exception";
  const agent = ev.agent_id;
  if (agent === "agent_market") return "agent_market";
  if (agent === "agent_exception") return "fpo_staff";
  return agent || "agent_intake";
}

function buildReplaySteps(events) {
  return events.map((ev, idx) => ({
    id: `step-${idx}`,
    from: inferFromActor(ev),
    to: inferToActor(ev),
    title: ev.title || titleCase(ev.entity_type || "Activity"),
    detail: ev.detail || "",
    kicker: ev.agent_name || titleCase(ev.agent_id || "Agent"),
    payload: ENTITY_LABEL[ev.entity_type] || "update",
    tone: ev.requires_human ? "human" : (ev.kind === "alert" ? "alert" : "auto"),
  }));
}

const DEMO_STEPS = [
  { id: "d0", from: "farmer",            to: "agent_intake",      kicker: "Farmer",      title: "\"Leaves turning yellow on my onion, also need 5 bags urea\"",
    detail: "Hindi voice note + photo arrives on WhatsApp.", payload: "voice+photo", tone: "auto" },
  { id: "d1", from: "agent_intake",      to: "agent_crop_cycle",  kicker: "Intake Agent", title: "Classified: disease symptom + input request",
    detail: "Two intents detected. Routing disease leg to Crop Cycle, input leg to Fulfillment.", payload: "disease case", tone: "auto" },
  { id: "d2", from: "agent_intake",      to: "agent_fulfillment", kicker: "Intake Agent", title: "Input demand: 5 bags Urea",
    detail: "Trust 0.62 — below auto-approve threshold.", payload: "input demand", tone: "auto" },
  { id: "d3", from: "agent_crop_cycle",  to: "agent_exception",   kicker: "Crop Cycle",  title: "Low confidence on disease ID",
    detail: "Model guess: Purple Blotch (0.54). Escalating photo to agronomist.", payload: "disease case", tone: "alert" },
  { id: "d4", from: "agent_fulfillment", to: "agent_exception",   kicker: "Fulfillment", title: "Demand parked for FPO review",
    detail: "Trust below threshold. Queued into Review Queue.", payload: "review queue", tone: "alert" },
  { id: "d5", from: "agent_exception",   to: "fpo_staff",         kicker: "Handoff",     title: "Two items assigned to FPO Staff",
    detail: "Staff approves urea issue + confirms Purple Blotch diagnosis.", payload: "assignment", tone: "human" },
  { id: "d6", from: "fpo_staff",         to: "agent_fulfillment", kicker: "FPO Staff",   title: "Approved — issue 5 bags urea from stock",
    detail: "Inventory decrement + settlement accrual triggered.", payload: "input issue", tone: "auto" },
  { id: "d7", from: "fpo_staff",         to: "agent_crop_cycle",  kicker: "FPO Staff",   title: "Confirmed diagnosis → send advisory",
    detail: "Tebuconazole 1 ml/L spray schedule, 3 sprays at 10-day gap.", payload: "advisory", tone: "auto" },
  { id: "d8", from: "agent_crop_cycle",  to: "farmer",            kicker: "Crop Cycle",  title: "Advisory sent to farmer on WhatsApp",
    detail: "Hindi message + dosage image dispatched.", payload: "message", tone: "auto" },
  { id: "d9", from: "agent_fulfillment", to: "fpo_staff",         kicker: "Fulfillment", title: "Harvest ETA logged, notify Market via staff",
    detail: "60kg onion expected in 28 days. Staff forwards to Market agent.", payload: "harvest signal", tone: "auto" },
  { id: "d10",from: "fpo_staff",         to: "agent_market",      kicker: "FPO Staff",   title: "Market agent drafts sales order",
    detail: "Buyer BYR_021 at ₹24.50/kg. Draft SO queued for staff confirmation.", payload: "sales order", tone: "human" },
];

function edgeKey(a, b) { return [a, b].sort().join("|"); }

function curvedPath(A, B) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const bow = Math.min(36, len * 0.18);
  const cx = mx + nx * bow, cy = my + ny * bow;
  return `M ${A.x} ${A.y} Q ${cx} ${cy} ${B.x} ${B.y}`;
}

const WALK_EDGES = [
  ["farmer","agent_intake"],
  ["agent_intake","agent_fulfillment"],
  ["agent_intake","agent_crop_cycle"],
  ["agent_fulfillment","agent_exception"],
  ["agent_crop_cycle","agent_exception"],
  ["agent_exception","fpo_staff"],
  ["fpo_staff","agent_fulfillment"],
  ["fpo_staff","agent_crop_cycle"],
  ["fpo_staff","agent_market"],
  ["agent_crop_cycle","farmer"],
];

function WalkthroughScene({ steps, stepIndex }) {
  const step = steps[stepIndex];
  const from = step ? WALK_ACTOR_BY_ID[step.from] : null;
  const to = step ? WALK_ACTOR_BY_ID[step.to] : null;
  const activeFrom = step?.from;
  const activeTo = step?.to;
  const toneColor = step?.tone === "alert" ? "#ef4444" : step?.tone === "human" ? "#7c3aed" : "#17b897";
  const liveEdgeKey = step ? edgeKey(step.from, step.to) : null;

  return (
    <div className="walk-scene-shell">
      <svg viewBox="0 0 740 280" className="walk-scene-svg" role="img" aria-label="Agent-to-agent flow scene" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="walkBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f0fdf4" />
            <stop offset="1" stopColor="#ecfeff" />
          </linearGradient>
          <filter id="walkShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.14" />
          </filter>
          {WALK_EDGES.map(([a, b], idx) => {
            const A = WALK_ACTOR_BY_ID[a]; const B = WALK_ACTOR_BY_ID[b];
            return <path key={`p-${idx}`} id={`walk-edge-${edgeKey(a,b)}`} d={curvedPath(A, B)} fill="none" />;
          })}
          {step && from && to ? (
            <path id={`walk-live-${step.id}`} d={curvedPath(from, to)} fill="none" />
          ) : null}
        </defs>
        <rect x="0" y="0" width="740" height="280" rx="14" fill="url(#walkBg)" />

        {WALK_EDGES.map(([a, b], idx) => {
          const live = liveEdgeKey === edgeKey(a, b);
          return (
            <use key={idx} href={`#walk-edge-${edgeKey(a,b)}`}
              stroke={live ? toneColor : "#cbd5e1"}
              strokeWidth={live ? 2.5 : 1.25}
              strokeDasharray={live ? "5 5" : "0"}
              opacity={live ? 0.95 : 0.5}
              fill="none"
            >
              {live ? <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="0.6s" repeatCount="indefinite" /> : null}
            </use>
          );
        })}

        {WALK_ACTORS.map((a) => {
          const isActive = a.id === activeFrom || a.id === activeTo;
          return (
            <g key={a.id} transform={`translate(${a.x},${a.y})`}>
              <circle r="30" fill="#fff" stroke={isActive ? toneColor : a.color} strokeWidth={isActive ? 3 : 1.75} filter="url(#walkShadow)" />
              {isActive ? (
                <circle r="36" fill="none" stroke={toneColor} strokeWidth="1.75" opacity="0.5">
                  <animate attributeName="r" from="32" to="44" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.55" to="0" dur="1.2s" repeatCount="indefinite" />
                </circle>
              ) : null}
              {a.kind === "person" ? (
                <g transform="translate(-12,-14)" fill={a.color}>
                  <circle cx="12" cy="6" r="5" />
                  <path d="M1 26 C1 16, 23 16, 23 26 L23 28 L1 28 Z" />
                </g>
              ) : (
                <g transform="translate(-12,-12)" fill={a.color}>
                  <rect x="1" y="3" width="22" height="15" rx="3" />
                  <circle cx="7" cy="10.5" r="1.8" fill="#fff" />
                  <circle cx="17" cy="10.5" r="1.8" fill="#fff" />
                  <rect x="9" y="19" width="6" height="4" />
                  <rect x="4" y="23" width="16" height="2" rx="1" />
                </g>
              )}
              <text textAnchor="middle" y="44" fontSize="11" fontWeight="600" fill="#0f172a">{a.label}</text>
              <text textAnchor="middle" y="56" fontSize="9" fill="#64748b">{a.sub}</text>
            </g>
          );
        })}

        {step && from && to ? (
          <g key={step.id}>
            <g>
              <circle r="9" fill={toneColor} opacity="0.22" />
              <circle r="5" fill={toneColor} />
              <text textAnchor="middle" y="-12" fontSize="10" fontWeight="600" fill={toneColor}>{step.payload}</text>
              <animateMotion dur="1.4s" fill="freeze" rotate="0">
                <mpath href={`#walk-live-${step.id}`} />
              </animateMotion>
            </g>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function WalkthroughSection({ sectionData, handlers }) {
  const recentRuns = sliceRows(sectionData?.recent_runs);
  const latestRunId = recentRuns?.[0]?.id;
  const [mode, setMode] = useState("demo");
  const [steps, setSteps] = useState(DEMO_STEPS);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2200);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!playing) return undefined;
    if (stepIndex >= steps.length - 1) { setPlaying(false); return undefined; }
    const id = setTimeout(() => setStepIndex((i) => Math.min(steps.length - 1, i + 1)), speed);
    return () => clearTimeout(id);
  }, [playing, stepIndex, steps.length, speed]);

  async function loadReplay() {
    if (!latestRunId) { setError("No completed runs yet. Run a cycle from Command first."); return; }
    setLoading(true); setError("");
    try {
      const payload = await api.agentRunEvents(latestRunId);
      const evs = payload.events || [];
      if (!evs.length) { setError("Latest run has no recorded events."); setLoading(false); return; }
      const built = buildReplaySteps(evs);
      setSteps(built); setStepIndex(0); setPlaying(true); setMode("replay");
    } catch (e) {
      setError(e.message || "Unable to load run events.");
    } finally { setLoading(false); }
  }

  function playDemo() {
    setSteps(DEMO_STEPS); setStepIndex(0); setMode("demo"); setPlaying(true);
  }

  const step = steps[stepIndex];
  const total = steps.length;
  const pct = total ? Math.round(((stepIndex + 1) / total) * 100) : 0;

  return (
    <div className="walkthrough-wrap">
      <section className="walkthrough-head">
        <div className="walkthrough-head-actions">
          <button type="button" className={`btn-ghost${mode === "demo" ? " is-active" : ""}`} onClick={playDemo} disabled={loading}>
            Play demo flow
          </button>
          <button type="button" className={`btn-primary${mode === "replay" ? " is-active" : ""}`} onClick={loadReplay} disabled={loading || !latestRunId}
            title={latestRunId ? `Replay run ${latestRunId}` : "No runs yet — trigger Run Cycle on Command first"}
          >
            {loading ? "Loading..." : "Replay last cycle"}
          </button>
        </div>
      </section>

      {error ? <p className="info-banner error">{error}</p> : null}

      <div className="walk-stage">
      <WalkthroughScene steps={steps} stepIndex={stepIndex} playing={playing} />

      <section className="walk-hud-inline">
        <div className="walk-progress">
          <div className="walk-progress-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="walk-caption">
          <div className="walk-caption-kicker">
            Step {stepIndex + 1} of {total} · {mode === "demo" ? "Demo: yellow-leaf onion + urea request" : `Replay · run ${latestRunId || ""}`}
          </div>
          <div className="walk-caption-text">
            <strong>{step?.kicker}</strong> — {step?.title}
          </div>
          {step?.detail ? <div className="walk-caption-detail">{step.detail}</div> : null}
        </div>
        <div className="walk-controls">
          <label className="walk-speed">
            Speed
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={3200}>Slow</option>
              <option value={2200}>Normal</option>
              <option value={1200}>Fast</option>
            </select>
          </label>
          <button type="button" className="btn-ghost btn-small" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>Prev</button>
          {playing ? (
            <button type="button" className="btn-ghost btn-small" onClick={() => setPlaying(false)}>Pause</button>
          ) : (
            <button type="button" className="btn-ghost btn-small" onClick={() => { if (stepIndex >= steps.length - 1) setStepIndex(0); setPlaying(true); }}>Play</button>
          )}
          <button type="button" className="btn-ghost btn-small" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))} disabled={stepIndex >= total - 1}>Next</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => { setStepIndex(0); setPlaying(false); }}>Restart</button>
        </div>
      </section>
      </div>
    </div>
  );
}

function CommandCenterSection({ sectionData, handlers }) {
  const summary = sectionData.summary || {};
  const flow = sectionData.flow || { nodes: [], edges: [], throughput_last_10: [] };
  const exceptions = sliceRows(sectionData.exceptions);
  const fulfillmentQueue = sliceRows(sectionData.fulfillment_queue);
  const harvestWatchlist = sliceRows(sectionData.harvest_watchlist);
  const marketQueue = sliceRows(sectionData.market_queue);
  const recentAlerts = sliceRows(sectionData.recent_alerts);
  const recentTasks = sliceRows(sectionData.recent_tasks);
  const recentRuns = sliceRows(sectionData.recent_runs);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = setInterval(() => {
      if (handlers.onRefreshSection) handlers.onRefreshSection("command");
    }, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, handlers]);

  const autoActions = Number(summary.autonomous_input_issues || 0) + Number(summary.autonomous_dispatches || 0);
  const humanExceptionsCount = Number(summary.human_exceptions || 0);
  const latestRun = recentRuns[0];
  const orderedAgents = [...(flow.nodes || [])].sort((a, b) => (AGENT_LAYOUT[a.id]?.order ?? 99) - (AGENT_LAYOUT[b.id]?.order ?? 99));
  const topExceptions = exceptions.slice(0, 4);

  async function runCycle() {
    if (busy) return;
    setBusy(true);
    try {
      await handlers.onRunAgentCycle({ force: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack command-page">
      <section className="cmd-head">
        <div className="cmd-head-title">
          <span className="cmd-head-kicker">
            <span className="cmd-live-dot" /> Live
          </span>
          <h3>Command Center</h3>
          <p className="cmd-head-note">Five specialists, one handoff desk, clear handoffs.</p>
        </div>
        <div className="cmd-head-actions">
          <label className="cmd-toggle">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <span>Auto-refresh</span>
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={runCycle}
            disabled={busy || !handlers.canAction("run_demo")}
            title={!handlers.canAction("run_demo") ? "Current role cannot trigger the agent cycle" : "Run one autonomous agent cycle"}
          >
            {busy ? "Running..." : "Run Cycle"}
          </button>
          {handlers.onResetDemo ? (
            <ResetDemoButton onResetDemo={handlers.onResetDemo} disabled={busy || !handlers.canAction("reseed")} />
          ) : null}
        </div>
      </section>

      <section className="stat-grid dashboard-stat-grid">
        <StatCard label="Farmers" value={number(summary.farmers_managed)} />
        <StatCard label="Auto Work" value={number(autoActions)} helper="Autonomous issues + dispatches" />
        <StatCard label="Active Queues" value={number(summary.active_workflows)} helper="Fulfillment + market in motion" />
        <StatCard label="Needs People" value={number(humanExceptionsCount)} tone={humanExceptionsCount ? "high" : "normal"} helper={humanExceptionsCount ? "Escalations + approvals open" : "No open handoffs"} />
      </section>

      <section className="cmd-stage glass-strong">
        <div className="cmd-stage-head">
          <div>
            <div className="content-block-hint">Agent floor</div>
            <div className="cmd-stage-title">Who is doing what</div>
          </div>
          <div className="cmd-stage-run">
            <span className="cmd-stage-run-label">Latest cycle</span>
            <span className="cmd-stage-run-value">{latestRun ? compactDateTime(latestRun.started_at) : "Awaiting first cycle"}</span>
          </div>
        </div>

        <div className="cmd-agent-grid">
          {orderedAgents.map((node) => (
            <CommandAgentCard key={node.id} node={node} activity={flow.per_agent_activity?.[node.id]} />
          ))}
        </div>

      </section>

      <div className="equal-grid cmd-support-grid">
        <section className="cmd-pulse glass-normal">
          <div className="cmd-pulse-head">
            <span className="cmd-pulse-label">Needs People</span>
            <span className="cmd-pulse-meta">{number(humanExceptionsCount)}</span>
          </div>
          <div className="cmd-exception-list">
            {topExceptions.length ? topExceptions.map((row) => (
              <article key={row.id} className="cmd-exception-row">
                <div className="cmd-exception-top">
                  <span className="cmd-exception-type">{row.type}</span>
                  <SeverityBadge value={row.status} />
                </div>
                <div className="cmd-exception-name">{row.farmer_name}</div>
                <div className="cmd-exception-reason">{row.reason || "Needs office attention"}</div>
              </article>
            )) : <div className="ticker-empty">No open handoffs.</div>}
          </div>
        </section>

        <section className="cmd-pulse glass-normal">
          <div className="cmd-pulse-head">
            <span className="cmd-pulse-label">Pulse</span>
            <span className="cmd-pulse-meta">{latestRun ? compactDateTime(latestRun.started_at) : "Awaiting first cycle"}</span>
          </div>
          {latestRun?.summary ? <p className="cmd-run-summary">{latestRun.summary}</p> : null}
          <PulseFeed tasks={recentTasks.slice(0, 6)} />
        </section>
      </div>

      <section className="cmd-details">
        <button type="button" className="cmd-details-toggle" onClick={() => setShowDetails((v) => !v)}>
          {showDetails ? "Hide details" : "Show details"}
        </button>
        {showDetails ? (
          <div className="stack">
            <TableCard title="Activity log" collapsible>
              <DataTable
                columns={[
                  { key: "created_at", label: "Created", render: (value) => formatDateTime(value) },
                  { key: "agent_name", label: "Agent" },
                  { key: "title", label: "Task" },
                  { key: "status", label: "Status", render: (value) => <SeverityBadge value={value} /> },
                  { key: "detail", label: "Detail" }
                ]}
                rows={recentTasks}
              />
            </TableCard>

            <TableCard title="Handoff queue" collapsible>
              <DataTable
                columns={[
                  { key: "type", label: "Type" },
                  { key: "farmer_name", label: "Farmer / Entity" },
                  { key: "status", label: "Status", render: (value) => <SeverityBadge value={value} /> },
                  { key: "owner", label: "Owner" },
                  { key: "reason", label: "Reason" }
                ]}
                rows={exceptions}
              />
            </TableCard>

            <TableCard title="Message and alert history" collapsible>
              <DataTable
                columns={[
                  { key: "created_at", label: "Created", render: (value) => formatDateTime(value) },
                  { key: "agent_name", label: "Agent" },
                  { key: "farmer_name", label: "Farmer" },
                  { key: "crop", label: "Crop" },
                  { key: "alert_type", label: "Alert Type", render: (value) => titleCase(value) },
                  { key: "text", label: "Message" }
                ]}
                rows={recentAlerts}
              />
            </TableCard>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RegistrySection({ sectionData, handlers }) {
  const fpos = sliceRows(sectionData.fpos);
  const farmers = sortRowsByNewestId(sliceRows(sectionData.farmers));
  const plots = sliceRows(sectionData.plots);
  const seasons = sliceRows(sectionData.seasons);
  const communicationProfiles = sliceRows(sectionData.communicationProfiles);
  const districts = sectionData.geographies?.districts || [];
  const villages = sectionData.geographies?.villages || [];
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ fpo_id: fpos[0]?.id || "", name: "", village: "", primary_crop: "Onion", land_size_ha: "2.2", language: "Marathi" });

  useEffect(() => {
    if (!form.fpo_id && fpos.length) setForm((current) => ({ ...current, fpo_id: fpos[0].id }));
  }, [form.fpo_id, fpos]);

  return (
    <div className="stack">
      <div className="section-toolbar">
        <div className="stat-grid">
          <StatCard label="FPOs" value={number(sectionData.fpos?.total)} />
          <StatCard label="Farmers" value={number(sectionData.farmers?.total)} />
          <StatCard label="Plots" value={number(sectionData.plots?.total)} />
          <StatCard label="Seasons" value={number(sectionData.seasons?.total)} />
        </div>
        <button type="button" className="btn-primary" onClick={() => setDrawerOpen(true)} disabled={!handlers.canAction("create_farmer")}>Add Farmer</button>
      </div>

      <div className="stack">
        <TableCard title="FPO Directory" collapsible>
          <DataTable enableSearch enableFilters columns={[{ key: "name", label: "FPO" }, { key: "district", label: "District" }, { key: "primary_crops", label: "Primary Crops" }, { key: "members_count", label: "Members", render: (value) => number(value) }, { key: "warehouse_capacity_mt", label: "Warehouse (MT)" }]} rows={fpos} />
        </TableCard>
        <TableCard title="Farmer Registry" collapsible>
          <DataTable enableSearch enableFilters columns={[{ key: "name", label: "Farmer" }, { key: "fpo_name", label: "FPO" }, { key: "village", label: "Village" }, { key: "primary_crop", label: "Crop" }, { key: "land_size_ha", label: "Land (ha)", render: (value) => number(value, 2) }, { key: "irrigation_type", label: "Irrigation" }, { key: "soil_type", label: "Soil" }]} rows={farmers} />
        </TableCard>
        <TableCard title="Plot Intelligence" collapsible>
          <DataTable enableSearch enableFilters columns={[{ key: "id", label: "Plot ID" }, { key: "farmer_id", label: "Farmer" }, { key: "crop_current", label: "Crop" }, { key: "area_ha", label: "Area (ha)", render: (value) => number(value, 2) }, { key: "irrigation_source", label: "Irrigation" }, { key: "soil_type", label: "Soil" }]} rows={plots} />
        </TableCard>
        <TableCard title="Season Register" collapsible>
          <DataTable enableSearch enableFilters columns={[{ key: "plot_id", label: "Plot" }, { key: "crop_name", label: "Crop" }, { key: "seed_variety", label: "Variety" }, { key: "sowing_date", label: "Sowing" }, { key: "expected_harvest", label: "Harvest" }]} rows={seasons} />
        </TableCard>
        <TableCard title="Communication Profiles" collapsible>
          <DataTable enableSearch enableFilters columns={[{ key: "farmer_id", label: "Farmer ID" }, { key: "language", label: "Language" }, { key: "preferred_mode", label: "Mode" }, { key: "whatsapp_opt_in", label: "WhatsApp", render: (value) => (value ? "Yes" : "No") }]} rows={communicationProfiles} />
        </TableCard>
        <TableCard title="Geographies" collapsible>
          <div className="equal-grid"><DataTable enableSearch enableFilters columns={[{ key: "name", label: "District" }, { key: "state_id", label: "State ID" }]} rows={districts} /><DataTable enableSearch enableFilters columns={[{ key: "name", label: "Village" }, { key: "district_id", label: "District" }]} rows={villages} /></div>
        </TableCard>
      </div>

      <Drawer open={drawerOpen} title="Add Farmer" subtitle="Create a farmer, communication profile, default plot, and active season." onClose={() => setDrawerOpen(false)}>
        <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateFarmer({ ...form, land_size_ha: Number(form.land_size_ha) }), () => setDrawerOpen(false)); }}>
          <label><span>FPO</span><select value={form.fpo_id} onChange={(event) => setForm({ ...form, fpo_id: event.target.value })}>{fpos.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label><span>Name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label><span>Village</span><input value={form.village} onChange={(event) => setForm({ ...form, village: event.target.value })} required /></label>
          <label><span>Primary crop</span><input value={form.primary_crop} onChange={(event) => setForm({ ...form, primary_crop: event.target.value })} required /></label>
          <label><span>Land (ha)</span><input type="number" step="0.1" value={form.land_size_ha} onChange={(event) => setForm({ ...form, land_size_ha: event.target.value })} /></label>
          <label><span>Language</span><input value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} /></label>
          <div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>Cancel</button><button type="submit" className="btn-primary">Create farmer</button></div>
        </form>
      </Drawer>
    </div>
  );
}

function WhatsAppDemoSectionV2({ sectionData, handlers }) {
  const lookups = sectionData.lookups || {};
  const allInbox = sliceRows(sectionData.inbox);
  const inbox = allInbox.filter((row) => row.escalated);
  const farmerOptions = lookups.farmers || [];
  const canCommunicate = handlers.canAction("communicate");
  const agentConfig = sectionData.agentConfig || {};
  const [selectedFarmerId, setSelectedFarmerId] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [farmerText, setFarmerText] = useState("");
  const [officeText, setOfficeText] = useState("");
  const [farmerThreadRows, setFarmerThreadRows] = useState([]);
  const [officeThreadRows, setOfficeThreadRows] = useState([]);
  const [farmerThreadLoading, setFarmerThreadLoading] = useState(false);
  const [officeThreadLoading, setOfficeThreadLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  const categoryOptions = Array.from(new Set(inbox.map((r) => r.escalation_category).filter((c) => c && c !== "none")));
  const filteredInbox = inbox
    .filter((r) => typeFilter === "all" || r.escalation_category === typeFilter)
    .slice()
    .sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
  const pendingTickets = filteredInbox.filter((row) => row.status === "pending");
  const inProgressTickets = filteredInbox.filter((row) => row.status === "in_progress");
  const resolvedTickets = filteredInbox.filter((row) => row.status === "resolved");
  const selectedTicket = inbox.find((row) => row.id === selectedMessageId) || null;
  const selectedFarmer = farmerOptions.find((row) => row.id === selectedFarmerId) || null;
  const selectedTicketFarmer = selectedTicket ? farmerOptions.find((row) => row.id === selectedTicket.farmer_id) : null;

  // One-time init: select first ticket and sync farmer to it
  const initDone = useState(false);
  useEffect(() => {
    if (initDone[0]) return;
    const first = pendingTickets[0] || inProgressTickets[0] || resolvedTickets[0];
    if (first) {
      setSelectedMessageId(first.id);
      setSelectedFarmerId(first.farmer_id);
      initDone[1](true);
    } else if (!selectedFarmerId && farmerOptions.length) {
      setSelectedFarmerId(farmerOptions[0].id);
    }
  }, [inbox, farmerOptions, initDone, pendingTickets, inProgressTickets, resolvedTickets, selectedFarmerId]);

  useEffect(() => {
    if (selectedMessageId && !inbox.some((row) => row.id === selectedMessageId)) {
      setSelectedMessageId("");
    }
  }, [inbox, selectedMessageId]);

  useEffect(() => {
    let active = true;
    async function loadThread() {
      if (!selectedFarmerId) {
        setFarmerThreadRows([]);
        return;
      }
      setFarmerThreadLoading(true);
      try {
        const payload = await api.communicationThread(selectedFarmerId, 80);
        if (active) {
          const sortedRows = sliceRows(payload).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          setFarmerThreadRows(sortedRows);
        }
      } finally {
        if (active) setFarmerThreadLoading(false);
      }
    }
    loadThread();
    return () => {
      active = false;
    };
  }, [selectedFarmerId, sectionData.thread?.total, sectionData.inbox?.total]);

  useEffect(() => {
    let active = true;
    async function loadThread() {
      if (!selectedTicket?.farmer_id) {
        setOfficeThreadRows([]);
        return;
      }
      setOfficeThreadLoading(true);
      try {
        const payload = await api.communicationThread(selectedTicket.farmer_id, 80);
        if (active) {
          const sortedRows = sliceRows(payload).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          setOfficeThreadRows(sortedRows);
        }
      } finally {
        if (active) setOfficeThreadLoading(false);
      }
    }
    loadThread();
    return () => {
      active = false;
    };
  }, [selectedTicket?.farmer_id, selectedTicket?.id, sectionData.thread?.total, sectionData.inbox?.total]);

  async function openTicket(ticket) {
    if (!ticket) return;
    setSelectedMessageId(ticket.id);
    setSelectedFarmerId(ticket.farmer_id);
    setOfficeText("");
    if (canCommunicate && ticket.status === "pending") {
      await handlers.onSetMessageStatus(ticket.id, "in_progress");
    }
  }

  async function submitFarmerMessage(event) {
    event.preventDefault();
    if (!canCommunicate || !selectedFarmerId || !farmerText.trim()) return;
    await handlers.onSendWhatsApp({ farmer_id: selectedFarmerId, text: farmerText.trim(), auto_reply: false });
    setFarmerText("");
  }

  async function submitOfficeReply(event) {
    event.preventDefault();
    if (!canCommunicate || !selectedTicket || !officeText.trim()) return;
    await handlers.onOfficeReply({ farmer_id: selectedTicket.farmer_id, text: officeText.trim(), message_id: selectedTicket.id });
    setOfficeText("");
  }

  async function resolveWithoutReply() {
    if (!canCommunicate || !selectedTicket) return;
    await handlers.onSetMessageStatus(selectedTicket.id, "resolved");
  }

  const resolvedReply = selectedTicket
    ? [...officeThreadRows]
        .reverse()
        .find((row) => row.direction === "outgoing" && (!row.message_id || row.message_id === selectedTicket.id))
    : null;
  const selectedTicketHasAgentReply = selectedTicket
    ? officeThreadRows.some((row) => row.direction === "outgoing" && row.message_id === selectedTicket.id && row.agent_generated)
    : false;
  const selectedTicketCanUseAgentReply = canCommunicate && selectedTicket && !agentConfig.agent_auto_reply_enabled && !selectedTicketHasAgentReply;
  const timeline = selectedTicket
    ? [
        { label: "Created", value: selectedTicket.timestamp },
        { label: "Opened", value: selectedTicket.in_progress_at || null },
        { label: "Replied", value: selectedTicket.resolved_at || resolvedReply?.timestamp || null }
      ]
    : [];

  function statusLabel(s) {
    if (s === "pending") return "New";
    if (s === "in_progress") return "In Progress";
    return "Resolved";
  }
  function statusClass(s) {
    if (s === "pending") return "badge-warn";
    if (s === "in_progress") return "badge-info";
    return "badge-ok";
  }
  function laneClass(s) {
    if (s === "pending") return "jira-lane-warn";
    if (s === "in_progress") return "jira-lane-info";
    return "jira-lane-ok";
  }
  function actionLabelForStatus(s) {
    if (s === "pending") return "Start";
    if (s === "in_progress") return "Resolve";
    return "Reopen";
  }
  function nextStatusForTicket(s) {
    if (s === "pending") return "in_progress";
    if (s === "in_progress") return "resolved";
    return "in_progress";
  }
  async function moveTicket(ticket, nextStatus) {
    if (!canCommunicate || !ticket || ticket.status === nextStatus) return;
    setSelectedMessageId(ticket.id);
    setSelectedFarmerId(ticket.farmer_id);
    await handlers.onSetMessageStatus(ticket.id, nextStatus);
  }

  const boardColumns = [
    { id: "pending", title: "New", subtitle: "Fresh incoming asks", rows: pendingTickets },
    { id: "in_progress", title: "In Progress", subtitle: "Being worked by the office", rows: inProgressTickets },
    { id: "resolved", title: "Resolved", subtitle: "Closed or replied", rows: resolvedTickets }
  ];

  return (
    <div className="stack">
      <AgentModeNotice agentConfig={agentConfig} />
      <div className="whatsapp-layout">
        <div className="phone-column">
          <label className="field-inline"><span>Farmer phone:</span><select value={selectedFarmerId} onChange={(event) => { const fid = event.target.value; setSelectedFarmerId(fid); const ticket = inbox.find((row) => row.farmer_id === fid); setSelectedMessageId(ticket ? ticket.id : ""); }}>{farmerOptions.map((row) => <option key={row.id} value={row.id}>{row.name} - {row.village}</option>)}</select></label>
          <div className="phone-frame">
            <div className="phone-screen">
              <div className="wa-header"><div className="wa-avatar" /><div><div className="wa-name">FPO Help Desk</div><div className="wa-status">{selectedFarmer?.name || "No farmer selected"}</div></div></div>
              <div className="wa-thread">
                {farmerThreadLoading ? <p className="wa-queue-empty">Loading thread...</p> : null}
                {!farmerThreadLoading && !farmerThreadRows.length ? <p className="wa-queue-empty">No messages yet for this farmer.</p> : null}
                {farmerThreadRows.slice(-18).map((row) => (
                  <div key={row.id} className={`wa-bubble ${row.direction === "incoming" ? "outgoing" : "incoming"}`}>
                    <div>{row.text}</div>
                    <div className="wa-time">{formatDateTime(row.timestamp)}</div>
                  </div>
                ))}
              </div>
              <form className="wa-input-bar" onSubmit={submitFarmerMessage}>
                <input className="wa-input" value={farmerText} onChange={(event) => setFarmerText(event.target.value)} placeholder="Type farmer message..." />
                <button type="submit" className="wa-send-btn" disabled={!canCommunicate || !selectedFarmerId || !farmerText.trim()}><span>{">"}</span></button>
              </form>
            </div>
          </div>
          <div className="scenario-pill-row">
            <button type="button" className="btn-ghost btn-small" onClick={() => setFarmerText(`Need 5 bags urea for ${selectedFarmer?.primary_crop || "crop"}.`)}>Input Request</button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setFarmerText(`What is today's mandi rate for ${selectedFarmer?.primary_crop || "crop"}...`)}>Price Query</button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setFarmerText(`Leaves on my ${selectedFarmer?.primary_crop || "crop"} are yellow.`)}>Disease Query</button>
          </div>
        </div>

        <div className="office-console glass-normal">
          <div className="jira-board-layout">
            <div className="jira-board-panel">
              <div className="jira-board-head">
                <h3>Human Handoff Desk</h3>
                <AgentStatusBadge agentConfig={agentConfig} />
              </div>
              <div className="table-controls">
                <div className="table-filter-grid">
                  <label className="table-control">
                    <span>Filter Type</span>
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                      <option value="all">All</option>
                      {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="table-control">
                    <span>Sort By Date</span>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                  </label>
                </div>
                <div className="table-controls-summary">
                  <span>Showing {filteredInbox.length} of {inbox.length}</span>
                </div>
              </div>

              <div className="jira-board-grid">
                {boardColumns.map((column) => (
                  <section key={column.id} className={`jira-lane ${laneClass(column.id)}`}>
                    <div className="jira-lane-head">
                      <div>
                        <h4>{column.title}</h4>
                        <p>{column.subtitle}</p>
                      </div>
                      <span className="jira-lane-count">{column.rows.length}</span>
                    </div>

                    <div className="jira-lane-list">
                      {!column.rows.length ? <p className="jira-lane-empty">No tickets in this lane.</p> : null}
                      {column.rows.map((row) => (
                        <button key={row.id} type="button" className={`jira-card ${selectedMessageId === row.id ? "active" : ""}`} onClick={() => openTicket(row)}>
                          <div className="jira-card-top">
                            <span className="jira-ticket-key">{row.id.slice(-6).toUpperCase()}</span>
                            <span className={`badge ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                          </div>
                          <div className="jira-card-body">
                            <strong className="jira-ticket-summary">{row.text || "No message"}</strong>
                            <span className="jira-ticket-meta">{row.farmer_name}</span>
                            <span className="jira-ticket-submeta">{formatDateTime(row.timestamp)}</span>
                            {row.escalation_category && row.escalation_category !== "none" ? (
                              <span className="jira-ticket-submeta" style={{ marginTop: 4, textTransform: "capitalize" }}>Type: {row.escalation_category}</span>
                            ) : null}
                          </div>
                          <div className="jira-card-bottom">
                            <IntentChip value={row.intent} />
                            <button
                              type="button"
                              className="btn-ghost btn-small jira-card-action"
                              disabled={!canCommunicate}
                              onClick={(event) => {
                                event.stopPropagation();
                                moveTicket(row, nextStatusForTicket(row.status));
                              }}
                            >
                              {actionLabelForStatus(row.status)}
                            </button>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="jira-detail-panel">
              {selectedTicket ? (
                <>
                  <div className="jira-detail-head">
                    <div>
                      <h4>{selectedTicketFarmer?.name || selectedTicket.farmer_name}</h4>
                      <span className="jira-detail-id">{selectedTicket.id}</span>
                    </div>
                    <div className="jira-detail-head-tags">
                      <IntentChip value={selectedTicket.intent} />
                      <span className={`badge ${statusClass(selectedTicket.status)}`}>{statusLabel(selectedTicket.status)}</span>
                    </div>
                  </div>

                  <div className="jira-detail-body">
                    <div className="jira-detail-summary-card">
                      <div className="jira-detail-summary-row">
                        <span className="jira-detail-field">Reporter</span>
                        <strong>{selectedTicketFarmer?.name || selectedTicket.farmer_name}</strong>
                      </div>
                      <div className="jira-detail-summary-row">
                        <span className="jira-detail-field">Village</span>
                        <span>{selectedTicketFarmer?.village || "Not set"}</span>
                      </div>
                      <div className="jira-detail-summary-row jira-detail-summary-text">
                        <span className="jira-detail-field">Issue</span>
                        <p>{selectedTicket.text || "No message provided."}</p>
                      </div>
                    </div>

                    <div className="jira-timeline">
                      {timeline.map((item) => (
                        <div key={item.label} className={`jira-timeline-item ${item.value ? "is-complete" : ""}`}>
                          <span className="jira-timeline-dot" />
                          <div>
                            <strong>{item.label}</strong>
                            <p>{item.value ? formatDateTime(item.value) : "Pending"}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="jira-thread">
                      {officeThreadLoading ? <p className="wa-queue-empty">Loading...</p> : null}
                      {!officeThreadLoading && !officeThreadRows.length ? <p className="wa-queue-empty">No messages yet.</p> : null}
                      {officeThreadRows.slice(-12).map((row) => (
                        <div key={row.id} className={`jira-msg ${row.direction === "incoming" ? "incoming" : "outgoing"}`}>
                          <span className="jira-msg-author">{row.direction === "incoming" ? selectedTicketFarmer?.name || selectedTicket.farmer_name : "FPO Office"}</span>
                          <p className="jira-msg-text">{row.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <form className="jira-reply" onSubmit={submitOfficeReply}>
                    <textarea rows={2} value={officeText} onChange={(event) => setOfficeText(event.target.value)} placeholder={`Reply to ${selectedTicket.farmer_name}...`} />
                    <div className="jira-reply-actions">
                      <button type="submit" className="btn-primary" disabled={!canCommunicate || !officeText.trim()}>Send</button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={!selectedTicketCanUseAgentReply}
                        title={agentConfig.agent_auto_reply_enabled ? "Agentic Work already auto-handles farmer messages." : selectedTicketHasAgentReply ? "This ticket already has an agent-generated reply." : "Send an agent-assisted reply."}
                        onClick={() => handlers.onAgentReply(selectedTicket.id)}
                      >
                        {agentConfig.agent_auto_reply_enabled ? "Auto Handled" : "Agent Reply"}
                      </button>
                      {selectedTicket.status !== "in_progress" ? (
                        <button type="button" className="btn-ghost" disabled={!canCommunicate} onClick={() => moveTicket(selectedTicket, "in_progress")}>Mark In Progress</button>
                      ) : null}
                      {selectedTicket.status !== "resolved" ? (
                        <button type="button" className="btn-ghost" disabled={!canCommunicate} onClick={resolveWithoutReply}>Resolve</button>
                      ) : (
                        <button type="button" className="btn-ghost" disabled={!canCommunicate} onClick={() => moveTicket(selectedTicket, "in_progress")}>Reopen</button>
                      )}
                    </div>
                  </form>
                </>
              ) : (
                <div className="jira-detail-empty">
                  <p>Select a ticket to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function idRank(value) {
  const match = String(value || "").match(/(\d+)(...!.*\d)/);
  return match ? Number(match[1]) : -1;
}

function rowDateValue(row, keys = []) {
  for (const key of keys) {
    const raw = row?.[key];
    if (!raw) continue;
    const value = new Date(raw);
    if (!Number.isNaN(value.getTime())) return value;
  }
  return null;
}

function sortRowsByRecency(rows, keys = []) {
  return [...rows].sort((left, right) => {
    const leftDate = rowDateValue(left, keys);
    const rightDate = rowDateValue(right, keys);
    if (leftDate && rightDate) return rightDate - leftDate;
    if (rightDate) return 1;
    if (leftDate) return -1;
    return idRank(right?.id) - idRank(left?.id);
  });
}

function recentRows(rows, keys = [], limit = 4) {
  return sortRowsByRecency(rows, keys).slice(0, limit);
}

function QueueFreshTag({ children = "New" }) {
  return <span className="queue-fresh-tag">{children}</span>;
}

function WorkboardCard({ eyebrow, title, subtitle, count, action, tone = "normal", children }) {
  return (
    <section className="workboard-card glass-normal" data-tone={tone}>
      <div className="workboard-head">
        <div>
          {eyebrow ? <div className="content-block-hint">{eyebrow}</div> : null}
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="workboard-head-side">
          {typeof count === "number" ? <span className="workboard-count">{number(count)}</span> : null}
          {action ? <div className="workboard-action">{action}</div> : null}
        </div>
      </div>
      <div className="workboard-body">{children}</div>
    </section>
  );
}

function WorkboardItem({ title, meta, detail, chips = [], action }) {
  return (
    <article className="workboard-item">
      <div className="workboard-item-copy">
        <div className="workboard-item-topline">
          <strong>{title}</strong>
          {chips.length ? (
            <div className="workboard-item-chips">
              {chips.map((chip, index) => <span key={`${title}-${index}`}>{chip}</span>)}
            </div>
          ) : null}
        </div>
        {meta ? <div className="workboard-item-meta">{meta}</div> : null}
        {detail ? <div className="workboard-item-detail">{detail}</div> : null}
      </div>
      {action ? <div className="workboard-item-action">{action}</div> : null}
    </article>
  );
}

function joinParts(parts, separator = " | ") {
  return parts
    .filter((part) => part != null && String(part).trim() !== "")
    .join(separator);
}

function SectionLead({ eyebrow, title, summary, metrics = [], status = [], actions, note }) {
  const leadMetrics = metrics.slice(0, 2);
  const label = eyebrow || title;
  return (
    <section className="section-lead glass-strong">
      <div className="section-lead-copy">
        <div className="section-lead-headline">
          <div className="section-lead-title-block">
            {label ? <h2>{label}</h2> : null}
          </div>
          {actions ? <div className="section-lead-actions">{actions}</div> : null}
        </div>
        {leadMetrics.length || status.length ? (
          <div className="section-lead-status">
            {leadMetrics.map((item) => (
              <span key={item.label} className={`section-lead-status-pill tone-${item.tone || "neutral"}`}>
                <strong>{item.value}</strong> {item.label}
              </span>
            ))}
            {status.map((item) => (
              <span key={`${item.label}-${item.tone || "neutral"}`} className={`section-lead-status-pill tone-${item.tone || "neutral"}`}>
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QueueActionRow({ id, title, meta, detail, chips = [], action, selected = false, onSelect, active = false, onClick }) {
  return (
    <article className={`queue-action-row ${active ? "active" : ""} ${selected ? "selected" : ""}`} onClick={onClick}>
      {onSelect || action ? (
        <div className="queue-action-toolbar">
          {onSelect ? (
            <div className="queue-action-check" onClick={(event) => event.stopPropagation()}>
              <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${id || title}`} />
            </div>
          ) : <span />}
          {action ? <div className="queue-action-cta" onClick={(event) => event.stopPropagation()}>{action}</div> : null}
        </div>
      ) : null}
      <div className="queue-action-copy">
        <div className="queue-action-top">
          <strong>{title}</strong>
          {chips.length ? <div className="queue-action-chips">{chips}</div> : null}
        </div>
        {meta ? <div className="queue-action-meta">{meta}</div> : null}
        {detail ? <div className="queue-action-detail">{detail}</div> : null}
      </div>
    </article>
  );
}

function QueueBoardColumn({ title, count, tone = "normal", children, action }) {
  return (
    <section className="queue-board-column" data-tone={tone}>
      <div className="queue-board-head">
        <div className="queue-board-title">
          <strong>{title}</strong>
          {typeof count === "number" ? <span>{count}</span> : null}
        </div>
        {action ? <div className="queue-board-head-action">{action}</div> : null}
      </div>
      <div className="queue-board-body">{children}</div>
    </section>
  );
}

const AGENT_THRESHOLDS = {
  INPUT_TRUST: 80,
  PR_AUTO_QTY: 120,
  PR_AUTO_VALUE: 150000,
  SALES_AUTO_QTY: 80,
};

function isAgenticMode(handlers) {
  return handlers?.dataProfile === "agentic_work";
}

function ResetDemoButton({ onResetDemo, disabled = false }) {
  const [confirm, setConfirm] = useState(false);
  const handle = async () => {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 4000);
      return;
    }
    setConfirm(false);
    if (onResetDemo) await onResetDemo();
  };
  return (
    <button
      type="button"
      className={`btn-ghost ${confirm ? "btn-ghost-danger" : ""}`}
      onClick={handle}
      disabled={disabled}
      title={disabled ? "Current role cannot reset demo" : "Reseed demo to a clean starting state"}
    >
      {confirm ? "Click again to reset" : "Reset demo"}
    </button>
  );
}

function AgentActivityRail({ agentActivity, onRunCycle, onResetDemo, canReset = true, canRun = true, busy = false }) {
  const runs = Array.isArray(agentActivity?.recent_runs) ? agentActivity.recent_runs : [];
  const tasks = Array.isArray(agentActivity?.recent_tasks) ? agentActivity.recent_tasks : [];
  const alerts = Array.isArray(agentActivity?.recent_alerts) ? agentActivity.recent_alerts : [];
  const summary = agentActivity?.summary || {};
  const doneTasks = tasks.filter((row) => row.status === "completed" && !row.requires_human);
  const [expanded, setExpanded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const lastRun = runs[0];
  const doneCount = doneTasks.length || Number(summary.autonomous_input_issues || 0) + Number(summary.autonomous_dispatches || 0);
  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    if (onResetDemo) await onResetDemo();
  };
  return (
    <section className="agent-rail glass-normal">
      <div className="agent-rail-head">
        <div className="agent-rail-head-main">
          <div className="agent-rail-kind">Done by agents</div>
          <h3>{doneCount} autonomous actions this cycle</h3>
          <p>
            {lastRun
              ? `Last run ${lastRun.id || ""} — ${lastRun.summary || "agents processed the live queue"}.`
              : "Agents will log their work here on the next cycle."}
          </p>
        </div>
        <div className="agent-rail-head-actions">
          {onRunCycle ? (
            <button type="button" className="btn-primary" onClick={onRunCycle} disabled={busy || !canRun} title={canRun ? "Run one autonomous agent cycle" : "Current role cannot run the cycle"}>
              {busy ? "Running..." : "Run agent cycle"}
            </button>
          ) : null}
          {onResetDemo ? (
            <button type="button" className={`btn-ghost ${confirmReset ? "btn-ghost-danger" : ""}`} onClick={handleReset} disabled={busy || !canReset} title={canReset ? "Reseed the demo to a clean starting state" : "Current role cannot reset demo"}>
              {confirmReset ? "Click again to reset" : "Reset demo"}
            </button>
          ) : null}
          <button type="button" className="btn-ghost btn-small" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide log" : `Show ${Math.min(doneTasks.length, 10)} actions`}
          </button>
        </div>
      </div>
      <div className="agent-rail-metrics">
        <span className="agent-rail-pill"><strong>{number(summary.autonomous_input_issues || 0)}</strong> input issues auto-fulfilled</span>
        <span className="agent-rail-pill"><strong>{number(summary.autonomous_dispatches || 0)}</strong> dispatches auto-created</span>
        <span className="agent-rail-pill"><strong>{number(summary.proactive_alerts || 0)}</strong> proactive farmer alerts</span>
        <span className="agent-rail-pill"><strong>{number(summary.human_exceptions || 0)}</strong> handed to humans</span>
      </div>
      {expanded ? (
        <div className="agent-rail-log">
          {doneTasks.slice(0, 10).map((task) => (
            <div key={task.id} className="agent-rail-log-row">
              <span className="agent-rail-log-agent">{task.agent_name || task.agent_id}</span>
              <span className="agent-rail-log-title">{task.title}</span>
              {task.detail ? <span className="agent-rail-log-detail">{task.detail}</span> : null}
            </div>
          ))}
          {alerts.slice(0, 4).map((alert) => (
            <div key={alert.id} className="agent-rail-log-row">
              <span className="agent-rail-log-agent">{alert.agent_name || alert.agent_id}</span>
              <span className="agent-rail-log-title">Proactive: {alert.alert_type}</span>
              <span className="agent-rail-log-detail">{alert.text}</span>
            </div>
          ))}
          {!doneTasks.length && !alerts.length ? (
            <div className="agent-rail-log-empty">No autonomous actions in the last run. Hit “Run agent cycle” to see the agents move.</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TrackerToneTag({ label, tone = "neutral" }) {
  return <span className={`tracker-tone-tag tone-${tone}`}>{label}</span>;
}

function trackerSearchText(item) {
  return [
    item.id,
    item.kind,
    item.title,
    item.subtitle,
    item.stage,
    item.current,
    item.next,
    item.why,
    item.owner,
    ...(item.linked || []).flatMap((entry) => [entry.label, entry.value])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function trackerFilter(items, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => trackerSearchText(item).includes(normalized));
}

function TrackerCard({ item, active, onClick }) {
  const nextStepAction = item.nextStepAction;
  const handleNext = (event) => {
    event.stopPropagation();
    if (nextStepAction) {
      nextStepAction();
    } else {
      onClick?.();
    }
  };
  const handleNextKey = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNext(event);
    }
  };
  const nextClickable = Boolean(nextStepAction);
  return (
    <button type="button" className={`tracker-card ${active ? "active" : ""}`} onClick={onClick}>
      <div className="tracker-card-top">
        <div className="tracker-card-kind">{item.kind}</div>
        <div className="tracker-card-top-right">
          {active ? <span className="selection-active-pill">Selected</span> : null}
          <TrackerToneTag label={item.stage} tone={item.tone} />
        </div>
      </div>
      <div className="tracker-card-title">{item.id}</div>
      <div className="tracker-card-subtitle">{item.title}</div>
      {item.subtitle ? <div className="tracker-card-meta">{item.subtitle}</div> : null}
      {item.agentStopReason ? (
        <div className="tracker-stop-reason" title="Why the agent cannot finish this">
          <span className="tracker-stop-reason-label">Agent stopped:</span>
          <span className="tracker-stop-reason-text">{item.agentStopReason}</span>
        </div>
      ) : null}
      <div className="tracker-card-current">{item.current}</div>
      {nextClickable ? (
        <span
          role="button"
          tabIndex={0}
          className="tracker-card-next tracker-card-next-action"
          onClick={handleNext}
          onKeyDown={handleNextKey}
          title={item.why ? `Why now: ${item.why}` : undefined}
        >
          <span className="tracker-card-next-label">Next</span>
          <span className="tracker-card-next-text">{item.next}</span>
          <span className="tracker-card-next-arrow" aria-hidden="true">→</span>
        </span>
      ) : (
        <div className="tracker-card-next" title={item.why ? `Why now: ${item.why}` : undefined}>Next: {item.next}</div>
      )}
      <div className="tracker-card-chips">
        <span className="tracker-chip">{item.owner}</span>
        {(item.linked || []).slice(0, 2).map((entry) => <span key={`${item.id}-${entry.label}-${entry.value}`} className="tracker-chip">{entry.label}: {entry.value}</span>)}
      </div>
    </button>
  );
}

function TrackerWorkspace({ title, helper, items, search, onSearchChange, activeId, onActiveIdChange, emptyTitle = "Nothing is open right now." }) {
  const filteredItems = useMemo(() => trackerFilter(items, search), [items, search]);
  const activeItem = filteredItems.find((item) => item.id === activeId) || filteredItems[0] || null;
  const summary = useMemo(() => ({
    action: filteredItems.filter((item) => item.bucket === "action").length,
    waiting: filteredItems.filter((item) => item.bucket === "waiting").length,
    watch: filteredItems.filter((item) => item.bucket === "watch").length
  }), [filteredItems]);

  useEffect(() => {
    if (!activeItem && activeId) onActiveIdChange(null);
    if (!activeId && filteredItems[0]) onActiveIdChange(filteredItems[0].id);
  }, [activeId, activeItem, filteredItems, onActiveIdChange]);

  return (
    <section className="tracker-shell glass-normal">
      <div className="tracker-head">
        <div>
          <h3>{title}</h3>
          {helper ? <p>{helper}</p> : null}
        </div>
        <label className="tracker-search">
          <span>Track</span>
          <input type="search" placeholder="Search ID, buyer, farmer, linked record" value={search} onChange={(event) => onSearchChange(event.target.value)} />
        </label>
      </div>

      <div className="tracker-summary">
        <span className="tracker-summary-pill"><strong>{filteredItems.length}</strong> open</span>
        <span className="tracker-summary-pill"><strong>{summary.action}</strong> act now</span>
        <span className="tracker-summary-pill"><strong>{summary.waiting}</strong> waiting</span>
        <span className="tracker-summary-pill"><strong>{summary.watch}</strong> watch</span>
      </div>

      <div className="tracker-body">
        <div className="tracker-pane">
          <div className="selection-pane-head">
            <div>
              <strong>Choose a work item</strong>
              <span className="selection-pane-note">Selecting a card opens the matching record on the right.</span>
            </div>
            {activeItem ? <span className="selection-active-pill">{activeItem.id}</span> : null}
          </div>
          <div className="tracker-grid">
            {filteredItems.length ? filteredItems.map((item) => (
              <TrackerCard key={item.id} item={item} active={activeItem?.id === item.id} onClick={() => onActiveIdChange(item.id)} />
            )) : <div className="queue-empty">{emptyTitle}</div>}
          </div>
        </div>

        <div className="tracker-detail">
          <div className="selection-pane-head selection-pane-head-detail">
            <div>
              <strong>Selected item</strong>
              <span className="selection-pane-note">This panel mirrors the highlighted card on the left.</span>
            </div>
            {activeItem ? <span className="selection-active-pill">{activeItem.id}</span> : null}
          </div>
          {activeItem ? (
            <div className="tracker-detail-card">
              <div className="tracker-detail-head">
                <div>
                  <div className="tracker-detail-kind">{activeItem.kind}</div>
                  <h3>{activeItem.id}</h3>
                  <p>{activeItem.title}</p>
                </div>
                <TrackerToneTag label={activeItem.stage} tone={activeItem.tone} />
              </div>

              {activeItem.agentStopReason ? (
                <div className="tracker-detail-stop">
                  <span className="tracker-detail-stop-label">Agent stopped here</span>
                  <strong>{activeItem.agentStopReason}</strong>
                </div>
              ) : null}
              <div className="tracker-detail-grid">
                <div><span className="hint">Current</span><strong>{activeItem.current}</strong></div>
                {(() => {
                  const clickable = Boolean(activeItem.nextStepAction);
                  return clickable ? (
                    <button
                      type="button"
                      className="tracker-detail-next tracker-detail-next-action"
                      onClick={activeItem.nextStepAction}
                      title={activeItem.why ? `Why now: ${activeItem.why}` : undefined}
                    >
                      <span className="hint">Next step</span>
                      <strong>{activeItem.next}</strong>
                      {activeItem.why ? <span className="tracker-detail-next-why">{activeItem.why}</span> : null}
                      <span className="tracker-detail-next-arrow" aria-hidden="true">→</span>
                    </button>
                  ) : (
                    <div className="tracker-detail-next">
                      <span className="hint">Next step</span>
                      <strong>{activeItem.next}</strong>
                      {activeItem.why ? <span className="tracker-detail-next-why">{activeItem.why}</span> : null}
                    </div>
                  );
                })()}
                <div><span className="hint">Owner</span><strong>{activeItem.owner}</strong></div>
              </div>

              {(activeItem.linked || []).length ? (
                <div className="tracker-links">
                  {(activeItem.linked || []).map((entry) => (
                    <span key={`${activeItem.id}-${entry.label}-${entry.value}`} className="tracker-link-pill">
                      <span>{entry.label}</span>
                      <strong>{entry.value}</strong>
                    </span>
                  ))}
                </div>
              ) : null}

              {(activeItem.actions || []).length ? (
                <div className="tracker-actions">
                  {activeItem.actions.map((action) => (
                    <button
                      key={`${activeItem.id}-${action.label}`}
                      type="button"
                      className={action.variant === "ghost" ? "btn-ghost" : "btn-primary"}
                      disabled={action.disabled}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : <div className="queue-empty">Select a work item to see the current step and next action.</div>}
        </div>
      </div>
    </section>
  );
}

function ageInDays(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
}

function AgeBadge({ date, warnDays = 3, criticalDays = 7, label }) {
  const days = ageInDays(date);
  if (days == null) return null;
  const tone = days >= criticalDays ? "high" : days >= warnDays ? "medium" : "neutral";
  const text = label || (days === 0 ? "today" : days === 1 ? "1d old" : `${days}d old`);
  return <span className={`badge badge-${tone}`} title={`Requested ${new Date(date).toLocaleString()}`}>{text}</span>;
}

function SubTabNav({ tabs, active, onChange }) {
  useHotkeys([
    { key: "ArrowLeft", handler: () => {
      const i = tabs.findIndex(t => t.id === active);
      if (i > 0) onChange(tabs[i - 1].id);
    }},
    { key: "ArrowRight", handler: () => {
      const i = tabs.findIndex(t => t.id === active);
      if (i >= 0 && i < tabs.length - 1) onChange(tabs[i + 1].id);
    }},
    ...tabs.slice(0, 9).map((tab, idx) => ({
      key: String(idx + 1), handler: () => onChange(tab.id)
    }))
  ]);
  return (
    <div className="subtab-nav glass-light" role="tablist">
      {tabs.map((tab) => {
        const count = typeof tab.count === "number" ? tab.count : null;
        const tone = tab.tone || (count && count > 0 ? "medium" : "neutral");
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            className={`subtab ${active === tab.id ? "active" : ""}`}
            onClick={() => onChange(tab.id)}
            title={tab.hint || ""}
          >
            <span className="subtab-label">{tab.label}</span>
            {count != null ? <span className={`subtab-count subtab-count-${tone}`}>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function useHotkeys(bindings) {
  useEffect(() => {
    function onKey(event) {
      const target = event.target;
      const tag = (target?.tagName || "").toLowerCase();
      const isEditable = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      for (const b of bindings) {
        if (!b) continue;
        if (b.allowInInputs !== true && isEditable) continue;
        if (b.ctrl && !(event.ctrlKey || event.metaKey)) continue;
        if (b.shift && !event.shiftKey) continue;
        if (b.key && event.key !== b.key) continue;
        event.preventDefault();
        b.handler(event);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings]);
}

function useSelection(rows, idKey = "id") {
  const [selected, setSelected] = useState(new Set());
  const ids = useMemo(() => rows.map((r) => r[idKey]).filter(Boolean), [rows, idKey]);
  useEffect(() => {
    setSelected((current) => {
      const next = new Set();
      for (const id of current) if (ids.includes(id)) next.add(id);
      return next;
    });
  }, [ids.join("|")]);
  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clear = () => setSelected(new Set());
  const selectAll = () => setSelected(new Set(ids));
  const allSelected = ids.length > 0 && selected.size === ids.length;
  return { selected, toggle, clear, selectAll, allSelected, count: selected.size, ids: [...selected] };
}

function BulkBar({ count, onClear, actions }) {
  if (!count) return null;
  return (
    <div className="bulk-bar glass-strong">
      <div className="bulk-bar-info">
        <strong>{count}</strong> selected
      </div>
      <div className="bulk-bar-actions">
        {actions.map((action, idx) => (
          <button
            key={action.label + idx}
            type="button"
            className={`btn-${action.tone || "primary"} btn-small`}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
        <button type="button" className="btn-ghost btn-small" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

function SelectableTable({ columns, rows, selection, idKey = "id", onRowClick, activeRowId, maxRows = 500 }) {
  const ids = useMemo(() => rows.map((r) => r[idKey]), [rows, idKey]);
  const allSelected = selection && ids.length > 0 && ids.every((id) => selection.selected.has(id));
  const someSelected = selection && ids.some((id) => selection.selected.has(id));
  const toggleAll = () => {
    if (!selection) return;
    if (allSelected) selection.clear();
    else ids.forEach((id) => { if (!selection.selected.has(id)) selection.toggle(id); });
  };
  const displayRows = rows.slice(0, maxRows);
  return (
    <div className="selectable-table-wrap">
      <table className="data-table selectable-table">
        <thead>
          <tr>
            {selection ? (
              <th className="col-select">
                <input
                  type="checkbox"
                  checked={!!allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && !!someSelected; }}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
            ) : null}
            {columns.map((c) => <th key={c.key + c.label}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row) => {
            const id = row[idKey];
            const isActive = activeRowId && activeRowId === id;
            const isSelected = selection?.selected.has(id);
            return (
              <tr
                key={id || JSON.stringify(row).slice(0, 40)}
                className={`${isActive ? "row-active" : ""} ${isSelected ? "row-selected" : ""} ${onRowClick ? "row-clickable" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selection ? (
                  <td className="col-select" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!isSelected}
                      onChange={() => selection.toggle(id)}
                      aria-label={`Select ${id}`}
                    />
                  </td>
                ) : null}
                {columns.map((c) => (
                  <td key={c.key + c.label}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > maxRows ? (
        <div className="table-pagination"><span>Showing {maxRows} of {rows.length}. Use filters to narrow.</span></div>
      ) : null}
    </div>
  );
}

function useSavedViews(scopeKey) {
  const storageKey = `fpo_saved_views_${scopeKey}`;
  const [views, setViews] = useState(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const persist = (next) => {
    setViews(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };
  const save = (name, payload) => {
    const next = [...views.filter((v) => v.name !== name), { name, payload, created: Date.now() }];
    persist(next);
  };
  const remove = (name) => persist(views.filter((v) => v.name !== name));
  return { views, save, remove };
}

function SavedViewsBar({ scope, currentFilters, onApply }) {
  const { views, save, remove } = useSavedViews(scope);
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState("");
  const hasActive = Object.values(currentFilters || {}).some((v) => v && String(v).length);
  return (
    <div className="saved-views-bar">
      {views.length ? views.map((v) => (
        <span key={v.name} className="saved-view-chip">
          <button type="button" className="saved-view-apply" onClick={() => onApply(v.payload)} title="Apply saved view">{v.name}</button>
          <button type="button" className="saved-view-remove" onClick={() => remove(v.name)} aria-label={`Remove ${v.name}`}>x</button>
        </span>
      )) : <span className="saved-view-empty">No saved views</span>}
      {showInput ? (
        <span className="saved-view-input">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" />
          <button type="button" className="btn-primary btn-small" disabled={!name.trim()} onClick={() => { save(name.trim(), currentFilters); setName(""); setShowInput(false); }}>Save</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => { setShowInput(false); setName(""); }}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="btn-ghost btn-small" disabled={!hasActive} onClick={() => setShowInput(true)} title="Save current filters as a view">Save view</button>
      )}
    </div>
  );
}

function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  useEffect(() => { if (open) { setQuery(""); setHighlight(0); } }, [open]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 30);
    return commands
      .map((c) => ({ c, score: (c.label + " " + (c.hint || "")).toLowerCase().includes(q) ? 1 : 0 }))
      .filter((x) => x.score > 0)
      .map((x) => x.c)
      .slice(0, 30);
  }, [commands, query]);
  if (!open) return null;
  function onKey(event) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((h) => Math.min(filtered.length - 1, h + 1)); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); return; }
    if (event.key === "Enter") {
      event.preventDefault();
      const pick = filtered[highlight];
      if (pick) { pick.run(); onClose(); }
    }
  }
  return (
    <div className="command-palette-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="command-palette glass-strong" role="dialog" aria-label="Command palette">
        <input
          autoFocus
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0); }}
          onKeyDown={onKey}
          placeholder="Type to search actions and tabs… (Esc to close)"
          className="command-palette-input"
        />
        <ul className="command-palette-list" role="listbox">
          {filtered.length ? filtered.map((c, idx) => (
            <li
              key={c.id}
              role="option"
              aria-selected={idx === highlight}
              className={`command-palette-item ${idx === highlight ? "active" : ""}`}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => { c.run(); onClose(); }}
            >
              <span className="command-palette-group">{c.group}</span>
              <span className="command-palette-label">{c.label}</span>
              {c.hint ? <span className="command-palette-hint">{c.hint}</span> : null}
            </li>
          )) : <li className="command-palette-empty">No matches</li>}
        </ul>
        <div className="command-palette-foot">Enter to run · ↑↓ to move · Esc to close</div>
      </div>
    </div>
  );
}

function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}

function OperationsSection({ sectionData, handlers }) {
  const demandsAll = sliceRows(sectionData.demands);
  const reviewQueue = sliceRows(sectionData.reviewQueue);
  const demands = demandsAll.filter((row) => row.status !== "needs_review");
  const inventory = sliceRows(sectionData.inventory);
  const inventoryTransactions = sliceRows(sectionData.inventoryTransactions);
  const collections = sliceRows(sectionData.collections);
  const settlements = sliceRows(sectionData.settlements);
  const marketSalesOrders = sliceRows(sectionData.marketSalesOrders);
  const marketDispatches = sliceRows(sectionData.marketDispatches);
  const governanceRows = sliceRows(sectionData.approvals);
  const procurement = sectionData.procurement || { purchase_requests: [], purchase_orders: [], goods_receipts: [], input_issues: [], pending_approvals: [] };
  const agentActivity = sectionData.agentActivity || {};
  const [agentBusy, setAgentBusy] = useState(false);
  const handleRunAgentCycle = async () => {
    if (!handlers.onRunAgentCycle) return;
    setAgentBusy(true);
    try { await handlers.onRunAgentCycle({}); } finally { setAgentBusy(false); }
  };
  const lookups = sectionData.lookups || {};
  const farmersById = useMemo(
    () => Object.fromEntries((lookups.farmers || []).map((row) => [row.id, row])),
    [lookups.farmers]
  );
  const farmerLabel = (rowOrFarmerId) => {
    if (rowOrFarmerId == null) return "Unknown farmer";
    if (typeof rowOrFarmerId === "string") {
      return farmersById[rowOrFarmerId]?.name || rowOrFarmerId;
    }
    const explicitName = String(rowOrFarmerId.farmer_name || "").trim();
    if (explicitName) return explicitName;
    const farmerId = String(rowOrFarmerId.farmer_id || "").trim();
    return farmersById[farmerId]?.name || farmerId || "Unknown farmer";
  };
  const demandsDisplay = useMemo(
    () => demandsAll.map((row) => ({ ...row, farmer_id: farmerLabel(row) })),
    [demandsAll, farmersById]
  );
  const reviewQueueDisplay = useMemo(
    () => reviewQueue.map((row) => ({ ...row, farmer_id: farmerLabel(row) })),
    [reviewQueue, farmersById]
  );
  const settlementsDisplay = useMemo(
    () => settlements.map((row) => ({ ...row, farmer_id: farmerLabel(row) })),
    [settlements, farmersById]
  );
  const capturedDemands = demands.filter((row) => row.status === "captured");
  const capturedDemandsDisplay = useMemo(
    () => demandsDisplay.filter((row) => row.status === "captured"),
    [demandsDisplay]
  );
  const fpoIdDefault = demands[0]?.fpo_id || lookups.fpos?.[0]?.id || "";
  const [tab, setTab] = useState("tracker");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [workboardCollapsed, setWorkboardCollapsed] = useState(false);
  const [drawer, setDrawer] = useState("");
  const [trackerQuery, setTrackerQuery] = useState("");
  const [trackerActiveId, setTrackerActiveId] = useState(null);
  const [prForm, setPrForm] = useState({ fpo_id: fpoIdDefault, item_id: lookups.inputs?.[0]?.id || "INPUT_0001", total_qty: "80", supplier_id: lookups.suppliers?.[0]?.id || "SUP_0001" });
  const [grnForm, setGrnForm] = useState({ po_id: "", qty_received: "70", damaged_qty: "2" });
  const [aggregateForm, setAggregateForm] = useState({ fpo_id: fpoIdDefault, item_id: demands[0]?.item_id || lookups.inputs?.[0]?.id || "" });
  const [issueForm, setIssueForm] = useState({ farmer_id: lookups.farmers?.[0]?.id || demands[0]?.farmer_id || "", item_id: demands[0]?.item_id || lookups.inputs?.[0]?.id || "", qty_issued: "8" });
  const [collectionForm, setCollectionForm] = useState({ farmer_id: lookups.farmers?.[0]?.id || "", crop: demands[0]?.crop || "Onion", quantity_qtl: "16", grade: "A", moisture_pct: "11.5", collection_center: "Main Center" });
  const approvalQueue = procurement.pending_approvals || [];
  const pendingApprovals = approvalQueue.filter((row) => row.status === "pending");
  const purchaseRequests = procurement.purchase_requests || [];
  const purchaseOrders = procurement.purchase_orders || [];
  const goodsReceipts = procurement.goods_receipts || [];
  const inputIssues = procurement.input_issues || [];
  const inputIssuesDisplay = useMemo(
    () => inputIssues.map((row) => ({ ...row, farmer_id: farmerLabel(row) })),
    [inputIssues, farmersById]
  );
  const lowStockRows = inventory.filter((row) => row.stock_status === "low");
  const openPurchaseRequests = purchaseRequests.filter((row) => isApprovalPending(row.approval_status));
  const inFlightPurchaseOrders = purchaseOrders.filter((row) => row.delivery_status !== "received");
  const unallocatedCollections = collections.filter((row) => row.status !== "allocated_to_order");
  const pendingSettlementRows = settlementsDisplay.filter((row) => row.payment_status === "pending");
  const payableSettlementRows = pendingSettlementRows.filter((row) => canMarkSettlementPaid(row, marketSalesOrders));
  const pendingGovernanceApprovals = governanceRows.filter((row) => row.status === "pending");
  const orderAttentionRows = marketSalesOrders.filter((row) => salesOrderNeedsAttention(row, marketDispatches));
  const paidSettlementRows = recentRows(settlements.filter((row) => row.payment_status === "paid"), ["payment_date"], 4);
  const recentDemandSignals = recentRows([...reviewQueueDisplay, ...capturedDemandsDisplay], ["request_date"], 4);
  const recentGoodsReceipts = recentRows(goodsReceipts, ["receipt_date"], 4);
  const recentInventoryMoves = recentRows(inventoryTransactions, ["txn_date"], 4);
  const recentCollections = recentRows(collections, ["date"], 4);
  const recentInputIssues = recentRows(inputIssuesDisplay, ["issue_date"], 4);

  useEffect(() => {
    if (fpoIdDefault && !prForm.fpo_id) setPrForm((current) => ({ ...current, fpo_id: fpoIdDefault }));
    if (!aggregateForm.fpo_id && fpoIdDefault) setAggregateForm((current) => ({ ...current, fpo_id: fpoIdDefault }));
    if (!aggregateForm.item_id && lookups.inputs?.[0]?.id) setAggregateForm((current) => ({ ...current, item_id: lookups.inputs[0].id }));
    if (!issueForm.farmer_id && lookups.farmers?.[0]?.id) setIssueForm((current) => ({ ...current, farmer_id: lookups.farmers[0].id }));
    if (!issueForm.item_id && lookups.inputs?.[0]?.id) setIssueForm((current) => ({ ...current, item_id: lookups.inputs[0].id }));
    if (!collectionForm.farmer_id && lookups.farmers?.[0]?.id) setCollectionForm((current) => ({ ...current, farmer_id: lookups.farmers[0].id }));
    const firstPo = procurement.purchase_orders?.[0];
    if (firstPo && !grnForm.po_id) setGrnForm((current) => ({ ...current, po_id: firstPo.id }));
  }, [aggregateForm.fpo_id, aggregateForm.item_id, collectionForm.farmer_id, fpoIdDefault, grnForm.po_id, issueForm.farmer_id, issueForm.item_id, lookups, prForm.fpo_id, procurement.purchase_orders]);

  const reviewSelection = useSelection(reviewQueueDisplay);
  const prSelection = useSelection(openPurchaseRequests);
  const settlementSelection = useSelection(payableSettlementRows);

  const tabs = [
    { id: "tracker", label: "Tracker", count: reviewQueue.length + openPurchaseRequests.length + pendingSettlementRows.length + orderAttentionRows.length, tone: (reviewQueue.length || openPurchaseRequests.length || pendingSettlementRows.length || orderAttentionRows.length) ? "high" : "neutral", hint: "Press 1" },
    { id: "demands", label: "Demands", count: reviewQueue.length + capturedDemands.length, tone: reviewQueue.length ? "high" : (capturedDemands.length ? "medium" : "neutral"), hint: "Press 2" },
    { id: "procurement", label: "Procurement", count: openPurchaseRequests.length, tone: openPurchaseRequests.length ? "high" : "neutral", hint: "Press 3" },
    { id: "inventory", label: "Inventory", count: lowStockRows.length, tone: lowStockRows.length ? "high" : "neutral", hint: "Press 4" },
    { id: "collections", label: "Collections", count: unallocatedCollections.length, tone: unallocatedCollections.length ? "medium" : "neutral", hint: "Press 5" },
    { id: "settlements", label: "Settlements", count: pendingSettlementRows.length, tone: pendingSettlementRows.length ? "high" : "neutral", hint: "Press 6" }
  ];

  useHotkeys([
    { key: "k", ctrl: true, handler: () => setPaletteOpen(true) },
    { key: "Escape", allowInInputs: true, handler: () => { if (drawer) setDrawer(""); if (paletteOpen) setPaletteOpen(false); } },
    { key: "Enter", ctrl: true, allowInInputs: true, handler: () => {
      const activeForm = document.querySelector(".drawer.open form");
      if (activeForm) activeForm.requestSubmit();
    }}
  ]);

  const commands = useMemo(() => {
    const list = [];
    tabs.forEach((t) => list.push({ id: `tab-${t.id}`, group: "Tab", label: `Go to ${t.label}`, run: () => setTab(t.id) }));
    list.push({ id: "act-agg", group: "Action", label: "Aggregate demands", run: () => setDrawer("aggregate") });
    list.push({ id: "act-pr", group: "Action", label: "Create Purchase Request", run: () => setDrawer("pr") });
    list.push({ id: "act-grn", group: "Action", label: "Create Goods Receipt", run: () => setDrawer("grn") });
    list.push({ id: "act-issue", group: "Action", label: "Issue Inputs", run: () => setDrawer("issue") });
    list.push({ id: "act-coll", group: "Action", label: "Record Collection", run: () => setDrawer("collection") });
    list.push({ id: "act-gen", group: "Action", label: "Generate Settlements", run: () => handlers.onGenerateSettlements({}) });
    openPurchaseRequests.slice(0, 20).forEach((pr) => {
      list.push({ id: `pr-${pr.id}`, group: "Purchase Request", label: `Approve ${pr.id}`, hint: `${pr.item_name} · ${pr.supplier_name}`, run: () => handlers.onApprovePurchaseRequest(pr.id) });
    });
    payableSettlementRows.slice(0, 20).forEach((s) => {
      list.push({ id: `st-${s.id}`, group: "Settlement", label: `Mark ${s.id} paid`, hint: `${s.farmer_id} · ${currency(s.net_amount)}`, run: () => handlers.onMarkSettlementPaid(s.id) });
    });
    return list;
  }, [handlers, openPurchaseRequests, payableSettlementRows, tab, tabs]);

  const operationsTrackerItems = useMemo(() => {
    const items = [];
    const salesOrderApprovals = pendingGovernanceApprovals.filter((row) => row.approval_type === "sales_order");
    const settlementReleaseApprovals = pendingGovernanceApprovals.filter((row) => row.approval_type === "settlement_release");

    reviewQueueDisplay.forEach((row) => {
      const trust = Number(row.trust_score || 0);
      items.push({
        id: row.id,
        kind: "Demand review",
        title: row.item_name || "Uncertain farmer ask",
        subtitle: joinParts([row.farmer_id, row.crop || "No crop", row.request_date || "No date"]),
        stage: "Needs review",
        tone: "high",
        bucket: "action",
        automation: "escalated",
        current: row.source_text || "Intake Agent captured a low-confidence input demand.",
        next: "Approve or reject this demand line",
        why: `Intake confidence ${trust}% is below the ${AGENT_THRESHOLDS.INPUT_TRUST}% auto-capture threshold. Agent needs a human to confirm what the farmer asked for.`,
        agentStopReason: `Trust ${trust}% < ${AGENT_THRESHOLDS.INPUT_TRUST}% auto-capture threshold`,
        owner: "Operations desk",
        nextStepAction: () => setTab("demands"),
        linked: [
          { label: "Trust", value: `${number(row.trust_score)}%` },
          { label: "Source", value: row.source === "farmer_chat" ? "Farmer chat" : "Manual" }
        ],
        actions: [
          { label: "Approve", onClick: () => handlers.onApproveDemandReview(row.id, {}), disabled: !handlers.canAction("aggregate_demands") },
          { label: "Demands tab", variant: "ghost", onClick: () => setTab("demands") }
        ]
      });
    });

    openPurchaseRequests.forEach((row) => {
      const totalQty = Number(row.total_qty || 0);
      const approxValue = totalQty * Number(row.unit_rate || row.base_rate || 0);
      const qtyBreach = totalQty > AGENT_THRESHOLDS.PR_AUTO_QTY;
      const valueBreach = approxValue > AGENT_THRESHOLDS.PR_AUTO_VALUE;
      const stopReason = qtyBreach && valueBreach
        ? `Qty ${totalQty} > ${AGENT_THRESHOLDS.PR_AUTO_QTY} and value ₹${Math.round(approxValue).toLocaleString()} > ₹${AGENT_THRESHOLDS.PR_AUTO_VALUE.toLocaleString()}`
        : qtyBreach
          ? `Qty ${totalQty} > ${AGENT_THRESHOLDS.PR_AUTO_QTY} auto-approve cap`
          : valueBreach
            ? `Value ₹${Math.round(approxValue).toLocaleString()} > ₹${AGENT_THRESHOLDS.PR_AUTO_VALUE.toLocaleString()} auto-approve cap`
            : "Flagged for office approval";
      items.push({
        id: row.id,
        kind: "Purchase request",
        title: row.item_name,
        subtitle: joinParts([`${number(row.total_qty)} qty`, row.supplier_name]),
        stage: "Needs approval",
        tone: "high",
        bucket: "action",
        automation: "escalated",
        current: `${Array.isArray(row.input_demand_ids) ? row.input_demand_ids.length : 0} demand lines are grouped into this PR.`,
        next: "Approve the purchase request",
        why: `Fulfillment Agent raised this PR but cannot self-approve: ${stopReason}.`,
        agentStopReason: stopReason,
        owner: "Approvals desk",
        nextStepAction: () => setTab("procurement"),
        linked: [
          { label: "Supplier", value: row.supplier_name || "-" },
          { label: "Linked", value: String(Array.isArray(row.input_demand_ids) ? row.input_demand_ids.length : 0) }
        ],
        actions: [
          { label: "Approve PR", onClick: () => handlers.onApprovePurchaseRequest(row.id), disabled: !handlers.canAction("approve_pr") },
          { label: "Procurement tab", variant: "ghost", onClick: () => setTab("procurement") }
        ]
      });
    });

    inFlightPurchaseOrders.forEach((row) => {
      items.push({
        id: row.id,
        kind: "Purchase order",
        title: row.item_name,
        subtitle: joinParts([row.pr_id ? `PR ${row.pr_id}` : null, `${number(row.qty_ordered)} qty`, row.order_date || "No date"]),
        stage: "Awaiting receipt",
        tone: "medium",
        bucket: "waiting",
        automation: "auto",
        current: "Stock is on the way — Fulfillment Agent will create the GRN on delivery.",
        next: "Fulfillment Agent will record goods receipt",
        why: "Agent creates GRNs automatically once the supplier delivery check-in lands.",
        owner: "Fulfillment Agent",
        nextStepAction: () => setTab("procurement"),
        linked: [
          { label: "Supplier", value: row.supplier_id || "-" },
          { label: "Delivery", value: String(row.delivery_status || "in_transit").replaceAll("_", " ") }
        ],
        actions: [
          {
            label: "Create GRN",
            onClick: () => {
              setGrnForm((current) => ({ ...current, po_id: row.id, qty_received: String(Math.round(Number(row.qty_ordered || 0))), damaged_qty: current.damaged_qty || "0" }));
              setTab("procurement");
              setDrawer("grn");
            },
            disabled: !handlers.canAction("create_grn")
          }
        ]
      });
    });

    lowStockRows.forEach((row) => {
      items.push({
        id: `${row.fpo_id}-${row.item_name}`,
        kind: "Low stock",
        title: row.item_name,
        subtitle: joinParts([row.fpo_id, `${number(row.current_stock || 0)} on hand`]),
        stage: "Watch stock",
        tone: "medium",
        bucket: "watch",
        automation: "auto",
        current: "This line is below the comfort threshold.",
        next: "Fulfillment Agent will raise a replenishment PR on next cycle",
        why: "Agent watches stock levels and raises PRs automatically when inventory drops below threshold.",
        owner: "Fulfillment Agent",
        nextStepAction: () => setTab("inventory"),
        linked: [{ label: "Status", value: String(row.stock_status || "low") }],
        actions: [{ label: "Inventory tab", variant: "ghost", onClick: () => setTab("inventory") }]
      });
    });

    unallocatedCollections.forEach((row) => {
      items.push({
        id: row.id,
        kind: "Collection",
        title: `${row.crop} from ${row.farmer_name}`,
        subtitle: joinParts([`${number(row.quantity_qtl || 0, 1)} qtl`, row.date || "No date"]),
        stage: "Needs market link",
        tone: "medium",
        bucket: "waiting",
        automation: "auto",
        current: "Harvest is recorded and waiting for market allocation.",
        next: "Market Allocation Agent will match this on next cycle",
        why: "Agent scans open buyer demand and allocates collections automatically.",
        owner: "Market Allocation Agent",
        nextStepAction: () => handlers.onSetActive("market"),
        linked: [
          { label: "Grade", value: row.grade || "-" },
          { label: "Farmer", value: row.farmer_name || row.farmer_id || "-" }
        ],
        actions: [
          { label: "Open Market", variant: "ghost", onClick: () => handlers.onSetActive("market") }
        ]
      });
    });

    orderAttentionRows.forEach((row) => {
      const dispatch = marketDispatches.find((entry) => entry.sales_order_id === row.id);
      const salesApproval = salesOrderApprovals.find((entry) => entry.entity_id === row.id);
      const releaseApproval = settlementReleaseApprovals.find((entry) => entry.entity_id === row.id);
      const linkedSettlement = settlements.find((entry) => entry.sales_order_id === row.id);
      const approvalPending = isApprovalPending(row.approval_status);
      const paymentPending = row.payment_status !== "received";
      const dispatchPending = isApprovalCleared(row.approval_status) && !dispatch;
      const readyForPayment = canMarkSalesOrderPaid(row, marketDispatches);
      const qtyMt = Number(row.quantity_mt || 0);
      const automation = approvalPending ? "escalated" : "auto";
      const stage = approvalPending ? "Needs approval" : dispatchPending ? "Ready to dispatch" : paymentPending ? "Payment pending" : "In follow-through";
      const actions = [];
      if (approvalPending && salesApproval) {
        actions.push({ label: "Approve order", onClick: () => handlers.onDecideApproval(salesApproval.id, "approved"), disabled: !handlers.canAction("decide_approvals") });
      }
      if (dispatchPending) {
        actions.push({ label: "Open Market", variant: "ghost", onClick: () => handlers.onSetActive("market") });
      }
      if (readyForPayment) {
        actions.push({ label: "Mark paid", onClick: () => handlers.onMarkSalesOrderPaid(row.id), disabled: !handlers.canAction("mark_sales_paid") });
      }
      if (releaseApproval) {
        actions.push({ label: "Approve payout release", onClick: () => handlers.onDecideApproval(releaseApproval.id, "approved"), disabled: !handlers.canAction("decide_approvals") });
      } else if (!approvalPending && paymentPending) {
        actions.push({ label: "Open Market", variant: "ghost", onClick: () => handlers.onSetActive("market") });
      }
      items.push({
        id: row.id,
        kind: "Sales order",
        title: row.buyer_name,
        subtitle: joinParts([row.crop, `${number(row.quantity_mt || 0)} MT`, currency(row.price)]),
        stage,
        tone: approvalPending ? "high" : "medium",
        bucket: approvalPending ? "action" : "waiting",
        automation,
        current: approvalPending
          ? "Sales order exists but office approval is still open."
          : dispatchPending
            ? "Order is approved and still missing a dispatch record."
          : paymentPending
            ? `Order is ${dispatch ? "already dispatched" : "approved"} and still waiting on buyer payment.`
            : "Sales order is in downstream follow-through.",
        next: approvalPending
          ? `Approve the ${qtyMt} MT order (above ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm cap)`
          : dispatchPending
            ? "Market Allocation Agent will create the dispatch"
            : paymentPending
              ? "Waiting on buyer remittance"
              : "Execution Agent is tracking downstream work",
        why: approvalPending
          ? `Order quantity ${qtyMt} MT is above the ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm cap. Agent cannot self-approve.`
          : dispatchPending
            ? "Agent picks this up on the next cycle."
            : paymentPending
              ? "Buyer payment clears on its own or Finance Agent chases it."
              : "Downstream agents are handling this.",
        agentStopReason: approvalPending ? `Quantity ${qtyMt} MT ≥ ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm cap` : null,
        owner: approvalPending ? "Approvals desk" : dispatchPending ? "Market Allocation Agent" : paymentPending ? "Buyer / Finance Agent" : "Execution Agent",
        nextStepAction: () => {
          if (approvalPending) handlers.onSetActive("governance");
          else handlers.onSetActive("market");
        },
        linked: [
          { label: "Dispatch", value: dispatch?.id || "Not created" },
          { label: "Settlement", value: linkedSettlement?.id || "Not generated" }
        ],
        actions
      });
    });

    settlementReleaseApprovals.forEach((row) => {
      const so = marketSalesOrders.find((entry) => entry.id === row.entity_id);
      if (!so) return;
      items.push({
        id: row.id,
        kind: "Payout release",
        title: row.entity_id,
        subtitle: joinParts([so.buyer_name, so.crop]),
        stage: "Needs release approval",
        tone: "high",
        bucket: "action",
        automation: "escalated",
        current: "Buyer payment is recorded and farmer settlements were generated.",
        next: "Approve settlement release",
        why: "Finance Agent generated this payout but cash-out requires a human release sign-off by policy.",
        agentStopReason: "Cash-out policy requires human release approval",
        owner: "Approvals desk",
        nextStepAction: () => handlers.onSetActive("governance"),
        linked: [
          { label: "Sales order", value: so.id },
          { label: "Payment", value: String(so.payment_status || "-").replaceAll("_", " ") }
        ],
        actions: [
          { label: "Approve release", onClick: () => handlers.onDecideApproval(row.id, "approved"), disabled: !handlers.canAction("decide_approvals") },
          { label: "Approvals page", variant: "ghost", onClick: () => handlers.onSetActive("governance") }
        ]
      });
    });

    pendingSettlementRows.forEach((row) => {
      const linkedSalesOrder = marketSalesOrders.find((entry) => entry.id === row.sales_order_id);
      const releaseApproval = settlementReleaseApprovals.find((entry) => entry.entity_id === row.sales_order_id);
      const buyerPaymentPending = linkedSalesOrder ? !isPaymentReceived(linkedSalesOrder.payment_status) : false;
      const releaseRejected = linkedSalesOrder ? String(linkedSalesOrder.settlement_release_status || "").toLowerCase() === "rejected" : false;
      const payoutReady = canMarkSettlementPaid(row, marketSalesOrders);
      const automation = releaseApproval || releaseRejected ? "escalated" : "auto";
      items.push({
        id: row.id,
        kind: "Farmer payout",
        title: row.farmer_id,
        subtitle: joinParts([row.crop, currency(row.net_amount)]),
        stage: releaseApproval ? "Awaiting release approval" : buyerPaymentPending ? "Awaiting buyer payment" : releaseRejected ? "Release blocked" : "Awaiting payout",
        tone: releaseApproval || releaseRejected ? "high" : "medium",
        bucket: releaseApproval || releaseRejected ? "action" : "waiting",
        automation,
        current: releaseApproval
          ? "Settlement exists but payout release approval is still pending."
          : buyerPaymentPending
            ? "Settlement is linked to a sales order that is still waiting on buyer payment."
            : releaseRejected
              ? "Settlement release was rejected and must be cleared before payout."
              : "Settlement exists and Finance Agent will release it on next cycle.",
        next: releaseApproval
          ? "Approve payout release"
          : releaseRejected
            ? "Clear the payout release block"
            : buyerPaymentPending
              ? "Waiting on buyer remittance"
              : "Finance Agent will release on next cycle",
        why: releaseApproval
          ? "Finance Agent generated the payout; policy requires human release approval before cash-out."
          : releaseRejected
            ? "Agent cannot reopen a rejected release — human must restart the decision."
            : buyerPaymentPending
              ? "Buyer payment must clear first. Finance Agent chases remittance automatically."
              : "Finance Agent will release this on its next cycle.",
        agentStopReason: releaseApproval
          ? "Release approval policy requires human sign-off"
          : releaseRejected
            ? "Release rejected — agent cannot self-reopen"
            : null,
        owner: releaseApproval || releaseRejected ? "Approvals desk" : buyerPaymentPending ? "Buyer / Finance Agent" : "Finance Agent",
        nextStepAction: () => {
          if (releaseApproval || releaseRejected) handlers.onSetActive("governance");
          else setTab("settlements");
        },
        linked: [
          { label: "Sales order", value: row.sales_order_id || "-" },
          { label: "Collection", value: row.collection_id || "-" }
        ],
        actions: releaseApproval
          ? [
              { label: "Approve release", onClick: () => handlers.onDecideApproval(releaseApproval.id, "approved"), disabled: !handlers.canAction("decide_approvals") },
              { label: "Approvals page", variant: "ghost", onClick: () => handlers.onSetActive("governance") }
            ]
          : payoutReady
            ? [
                { label: "Mark paid", onClick: () => handlers.onMarkSettlementPaid(row.id), disabled: !handlers.canAction("release_settlement") },
                { label: "Settlements tab", variant: "ghost", onClick: () => setTab("settlements") }
              ]
            : [{ label: "Open payouts", variant: "ghost", onClick: () => setTab("settlements") }]
      });
    });

    const filtered = isAgenticMode(handlers) ? items.filter((item) => item.automation !== "auto") : items;
    return filtered.sort((left, right) => {
      const bucketRank = { action: 0, waiting: 1, watch: 2 };
      const bucketDiff = (bucketRank[left.bucket] ?? 9) - (bucketRank[right.bucket] ?? 9);
      if (bucketDiff !== 0) return bucketDiff;
      return idRank(right.id) - idRank(left.id);
    });
  }, [handlers, inFlightPurchaseOrders, lowStockRows, marketDispatches, marketSalesOrders, openPurchaseRequests, pendingGovernanceApprovals, pendingSettlementRows, reviewQueueDisplay, settlements, unallocatedCollections]);

  const hasUrgent = reviewQueue.length || lowStockRows.length || pendingSettlementRows.length || openPurchaseRequests.length;
  const operationsLead = tab === "tracker"
    ? {
        eyebrow: "Operations tracker",
        title: operationsTrackerItems.length ? "Track every moving record without hopping between desks" : "No active operational blockers right now",
        summary: "A joined worklist keeps review, procurement, market follow-through, and payout release in one place so the next step is obvious.",
        metrics: [
          { label: "Open work", value: number(operationsTrackerItems.length), detail: "Across review, supply, market, and payout", tone: operationsTrackerItems.length ? "high" : "normal" },
          { label: "Needs action", value: number(operationsTrackerItems.filter((item) => item.bucket === "action").length), detail: "Can be acted on now", tone: operationsTrackerItems.some((item) => item.bucket === "action") ? "high" : "normal" },
          { label: "Waiting", value: number(operationsTrackerItems.filter((item) => item.bucket === "waiting").length), detail: "Dependent on external movement", tone: operationsTrackerItems.some((item) => item.bucket === "waiting") ? "medium" : "normal" }
        ],
        status: [
          { label: operationsTrackerItems[0]?.id ? `Top work item ${operationsTrackerItems[0].id}` : "Tracker is clear", tone: operationsTrackerItems.length ? "high" : "normal" }
        ],
        primaryAction: <button type="button" className="btn-primary" onClick={() => setPaletteOpen(true)}>Open Tracker Commands</button>
      }
    : tab === "demands"
    ? {
        eyebrow: "Fulfillment command",
        title: reviewQueue.length ? "Review fresh farmer asks before they drift downstream" : "Farmer demand is moving cleanly through fulfillment",
        summary: "New agent-captured lines, rows ready to aggregate, and recently fulfilled requests are separated so the latest work is visible at a glance.",
        metrics: [
          { label: "Needs review", value: number(reviewQueue.length), detail: reviewQueue.length ? "Office confirmation required" : "Queue clear", tone: reviewQueue.length ? "high" : "normal" },
          { label: "Ready to aggregate", value: number(capturedDemands.length), detail: `${number(demands.filter((row) => row.status === "aggregated").length)} already grouped`, tone: capturedDemands.length ? "medium" : "normal" },
          { label: "Recently issued", value: number(demands.filter((row) => row.status === "issued").length), detail: "Completed lines stay visible" }
        ],
        status: [
          { label: reviewQueue.length ? `${number(reviewQueue.length)} auto-captured lines need human review` : "No review backlog", tone: reviewQueue.length ? "high" : "normal" },
          { label: recentDemandSignals[0]?.request_date ? `Latest signal ${compactDateTime(recentDemandSignals[0].request_date)}` : "No fresh demand signal yet", tone: "neutral" }
        ],
        primaryAction: <button type="button" className="btn-primary" onClick={() => setDrawer("aggregate")} disabled={!handlers.canAction("aggregate_demands") || !capturedDemands.length}>Aggregate to PR</button>
      }
    : tab === "procurement"
      ? {
          eyebrow: "Procurement lane",
          title: openPurchaseRequests.length ? "Keep purchasing unblocked from request to receipt" : "Procurement is flowing without open blockers",
          summary: "Open purchase requests, in-flight orders, and fresh receipts are separated so the newest blocking line items are impossible to miss.",
          metrics: [
            { label: "Open requests", value: number(openPurchaseRequests.length), detail: "Approval gates before PO creation", tone: openPurchaseRequests.length ? "high" : "normal" },
            { label: "Orders in motion", value: number(inFlightPurchaseOrders.length), detail: "Awaiting delivery confirmation", tone: inFlightPurchaseOrders.length ? "medium" : "normal" },
            { label: "Latest receipts", value: number(goodsReceipts.length), detail: recentGoodsReceipts[0]?.receipt_date ? `Newest ${compactDateTime(recentGoodsReceipts[0].receipt_date)}` : "No receipts yet" }
          ],
          status: [
            { label: openPurchaseRequests.length ? `${number(openPurchaseRequests.length)} requests are still waiting approval` : "No open PR approvals", tone: openPurchaseRequests.length ? "high" : "normal" },
            { label: recentGoodsReceipts[0]?.id ? `Latest GRN ${recentGoodsReceipts[0].id}` : "No goods receipts recorded yet", tone: "neutral" }
          ],
          primaryAction: <button type="button" className="btn-primary" onClick={() => setDrawer("pr")} disabled={!handlers.canAction("create_pr")}>Create PR</button>
        }
      : tab === "inventory"
        ? {
            eyebrow: "Inventory lane",
            title: lowStockRows.length ? "Watch stock risk and fresh issues in one place" : "Inventory looks healthy across the active rows",
            summary: "Low stock, fresh ledger movement, and the latest issues are separated so supply risk and new activity read like a clear queue instead of a ledger dump.",
            metrics: [
              { label: "Low stock", value: number(lowStockRows.length), detail: lowStockRows.length ? "Needs replenishment planning" : "Comfort band", tone: lowStockRows.length ? "high" : "normal" },
              { label: "Ledger moves", value: number(inventoryTransactions.length), detail: recentInventoryMoves[0]?.txn_date ? `Newest ${compactDateTime(recentInventoryMoves[0].txn_date)}` : "No movement yet" },
              { label: "Input issues", value: number(inputIssues.length), detail: recentInputIssues[0]?.issue_date ? `Latest ${compactDateTime(recentInputIssues[0].issue_date)}` : "No recent issues" }
            ],
            status: [
              { label: lowStockRows.length ? `${number(lowStockRows.length)} stock lines are below comfort` : "No stock alerts", tone: lowStockRows.length ? "high" : "normal" },
              { label: recentInputIssues[0]?.created_by_agent ? "Agent-created issues are flagged inline" : "Manual and agent issues share the same feed", tone: "neutral" }
            ],
            primaryAction: <button type="button" className="btn-primary" onClick={() => setDrawer("issue")} disabled={!handlers.canAction("issue_inputs")}>Issue Inputs</button>
          }
        : tab === "collections"
          ? {
              eyebrow: "Collections lane",
              title: unallocatedCollections.length ? "Track fresh intake before it slips past market allocation" : "Fresh harvest intake is being linked on time",
              summary: "New collections, unallocated lots, and premium-grade produce are separated so the office can immediately spot what is new and what still needs market action.",
              metrics: [
                { label: "Fresh collections", value: number(collections.length), detail: recentCollections[0]?.date ? `Newest ${compactDateTime(recentCollections[0].date)}` : "No intake yet", tone: "medium" },
                { label: "Waiting linkage", value: number(unallocatedCollections.length), detail: "Not yet mapped to a buyer order", tone: unallocatedCollections.length ? "high" : "normal" },
                { label: "Grade A lots", value: number(collections.filter((row) => row.grade === "A").length), detail: "Easy to target for premium demand" }
              ],
              status: [
                { label: unallocatedCollections.length ? `${number(unallocatedCollections.length)} collections still need market linkage` : "Recent collections are already allocated", tone: unallocatedCollections.length ? "high" : "normal" },
                { label: recentCollections[0]?.created_by_agent ? "Agent-recorded intake is tagged inline" : "New intake remains highlighted", tone: "neutral" }
              ],
              primaryAction: <button type="button" className="btn-primary" onClick={() => setDrawer("collection")} disabled={!handlers.canAction("record_collection")}>Record Collection</button>
            }
          : {
              eyebrow: "Settlements lane",
              title: pendingSettlementRows.length ? "Release payouts without losing approval blockers" : "Payout operations are caught up right now",
              summary: "Pending payouts, approval blockers, and newly completed payments are separated so fresh obligations stay visible until they are truly closed.",
              metrics: [
                { label: "Pending payouts", value: number(pendingSettlementRows.length), detail: "Awaiting release", tone: pendingSettlementRows.length ? "high" : "normal" },
                { label: "Approval blockers", value: number(pendingApprovals.length), detail: "Can hold up cash release", tone: pendingApprovals.length ? "medium" : "normal" },
                { label: "Recently paid", value: number(settlements.filter((row) => row.payment_status === "paid").length), detail: paidSettlementRows[0]?.payment_date ? `Newest ${compactDateTime(paidSettlementRows[0].payment_date)}` : "No paid history yet" }
              ],
              status: [
                { label: pendingSettlementRows.length ? `${number(pendingSettlementRows.length)} settlements still need release` : "No payout backlog", tone: pendingSettlementRows.length ? "high" : "normal" },
                { label: pendingApprovals.length ? `${number(pendingApprovals.length)} approval items can still block cash` : "No approval blocker for payouts", tone: pendingApprovals.length ? "medium" : "normal" }
              ],
              primaryAction: <button type="button" className="btn-primary" onClick={() => handlers.onGenerateSettlements({})} disabled={!handlers.canAction("generate_settlements")}>Generate Settlements</button>
            };

  return (
    <div className="stack">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <div className="section-sticky-head glass-light">
        <SubTabNav tabs={tabs} active={tab} onChange={setTab} />
        <div className="section-sticky-actions">
          <button type="button" className="btn-ghost btn-small" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">Ctrl+K</button>
          <button type="button" className="btn-ghost btn-small" onClick={() => setWorkboardCollapsed((v) => !v)} title="Toggle board">{workboardCollapsed ? "Show" : "Hide"} board</button>
        </div>
      </div>
      <SectionLead
        eyebrow={operationsLead.eyebrow}
        title={operationsLead.title}
        summary={operationsLead.summary}
        metrics={operationsLead.metrics}
        status={operationsLead.status}
        actions={
          <>
            {operationsLead.primaryAction}
            <button type="button" className="btn-ghost" onClick={() => setPaletteOpen(true)}>Commands</button>
          </>
        }
        note={hasUrgent ? "New line items stay pinned at the top of the lane until they are acted on. Use 1-6 to jump between fulfillment stages." : "Queues are calm right now. The overview stays above and the reference tables remain available below."}
      />
      {tab === "tracker" ? (
        <div className="stack">
          {isAgenticMode(handlers) ? (
            <AgentActivityRail
              agentActivity={agentActivity}
              onRunCycle={handleRunAgentCycle}
              onResetDemo={handlers.onResetDemo}
              canRun={handlers.canAction && handlers.canAction("run_demo")}
              canReset={handlers.canAction && handlers.canAction("reseed")}
              busy={agentBusy}
            />
          ) : null}
          <TrackerWorkspace
            title={isAgenticMode(handlers) ? "Escalations only — items agents cannot finish" : "Joined workflow tracker"}
            helper={isAgenticMode(handlers) ? "Everything here hit a policy gate or a low-confidence signal. Resolve it to hand the work back to the agents." : "Search any ID and the tracker will show where it is now, what is blocking it, and the next action."}
            items={operationsTrackerItems}
            search={trackerQuery}
            onSearchChange={setTrackerQuery}
            activeId={trackerActiveId}
            onActiveIdChange={setTrackerActiveId}
            emptyTitle={isAgenticMode(handlers) ? "All agents are unblocked — no escalations pending." : "No active operational work items match the current search."}
          />
        </div>
      ) : null}
      {tab === "demands" ? (
        <div className="stack">
          {!workboardCollapsed ? <div className="workboard-grid">
            <WorkboardCard eyebrow="Needs Review" title="Auto-captured asks waiting on office" subtitle="Low-confidence line items are kept separate so they do not disappear into the main feed." count={reviewQueue.length} tone={reviewQueue.length ? "high" : "normal"}>
              <div className="workboard-list">
                {reviewQueue.length ? recentRows(reviewQueueDisplay, ["request_date"], 4).map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${row.item_name || "Uncertain item"} · ${number(row.requested_qty || 0)} qty`}
                    meta={`${row.farmer_id} · ${row.crop || "No crop"} · ${row.request_date || "No date"}`}
                    detail={row.source_text || "Original farmer message unavailable."}
                    chips={[
                      <QueueFreshTag key="fresh" />,
                      <span className="badge badge-high" key="trust">{number(row.trust_score)}% trust</span>,
                      row.source === "farmer_chat" ? <span className="badge badge-info" key="agent">Agent</span> : null
                    ].filter(Boolean)}
                    action={
                      <div className="workboard-item-actions">
                        <InlineConfirmAction label="Approve" disabled={!handlers.canAction("aggregate_demands")} onConfirm={() => handlers.onApproveDemandReview(row.id, {})} />
                        <InlineConfirmAction label="Reject" disabled={!handlers.canAction("aggregate_demands")} onConfirm={() => handlers.onRejectDemandReview(row.id, {})} />
                      </div>
                    }
                  />
                )) : <div className="queue-empty">Nothing is waiting for manual review.</div>}
              </div>
            </WorkboardCard>

            {isAgenticMode(handlers) ? (
              <WorkboardCard
                eyebrow="Agent In Progress"
                title="Fulfillment Agent will aggregate these next"
                subtitle="High-confidence captured demands are auto-grouped into a PR on the next agent cycle. Nothing human to do here."
                count={capturedDemands.length}
                tone="neutral"
              >
                <div className="workboard-list">
                  {recentDemandSignals.filter((row) => row.status === "captured").length ? recentDemandSignals.filter((row) => row.status === "captured").slice(0, 4).map((row) => (
                    <WorkboardItem
                      key={row.id}
                      title={`${row.item_name} · ${number(row.requested_qty || 0)} qty`}
                      meta={`${row.fpo_id} · ${row.crop} · ${row.request_date || "No date"}`}
                      detail="Queued for Fulfillment Agent. No human action needed."
                      chips={[<span className="badge badge-info" key="auto">Auto</span>]}
                    />
                  )) : <div className="queue-empty">Queue is clear — agents handled everything in flight.</div>}
                </div>
              </WorkboardCard>
            ) : (
              <WorkboardCard eyebrow="Ready Next" title="Captured demands ready to aggregate" subtitle="These rows are clear enough to move forward and should be grouped into purchase requests." count={capturedDemands.length} tone="medium" action={<button type="button" className="btn-primary btn-small" onClick={() => setDrawer("aggregate")} disabled={!handlers.canAction("aggregate_demands") || !capturedDemands.length}>Aggregate</button>}>
                <div className="workboard-list">
                  {recentDemandSignals.filter((row) => row.status === "captured").length ? recentDemandSignals.filter((row) => row.status === "captured").map((row) => (
                    <WorkboardItem
                      key={row.id}
                      title={`${row.item_name} · ${number(row.requested_qty || 0)} qty`}
                      meta={`${row.fpo_id} · ${row.crop} · ${row.request_date || "No date"}`}
                      detail={`${row.farmer_id}${row.village ? ` · ${row.village}` : ""}`}
                      chips={[
                        <QueueFreshTag key="fresh" />,
                        row.source === "farmer_chat" ? <span className="badge badge-info" key="agent">Agent</span> : null
                      ].filter(Boolean)}
                    />
                  )) : <div className="queue-empty">No captured rows are waiting to be grouped right now.</div>}
                </div>
              </WorkboardCard>
            )}

          </div> : null}

          {reviewQueue.length ? (
            <TableCard title={`Review Queue — ${reviewQueue.length} auto-captured from farmer chat (trust < 80%)`}>
              <BulkBar
                count={reviewSelection.count}
                onClear={reviewSelection.clear}
                actions={[
                  { label: `Approve ${reviewSelection.count}`, tone: "primary", disabled: !handlers.canAction("aggregate_demands"), onClick: async () => {
                    for (const id of reviewSelection.ids) await handlers.onApproveDemandReview(id, {});
                    reviewSelection.clear();
                  }},
                  { label: `Reject ${reviewSelection.count}`, tone: "ghost", disabled: !handlers.canAction("aggregate_demands"), onClick: async () => {
                    for (const id of reviewSelection.ids) await handlers.onRejectDemandReview(id, {});
                    reviewSelection.clear();
                  }}
                ]}
              />
              <SelectableTable
                selection={reviewSelection}
                columns={[
                  { key: "farmer_id", label: "Farmer" },
                  { key: "item_name", label: "Item (guess)" },
                  { key: "requested_qty", label: "Qty", render: (v) => number(v) },
                  { key: "trust_score", label: "Trust", render: (value) => <span className={`badge badge-${value >= 80 ? "normal" : value >= 50 ? "medium" : "high"}`}>{value}%</span> },
                  { key: "source_text", label: "Original message", render: (value) => <span style={{ fontStyle: "italic", color: "#555" }}>"{value}"</span> },
                  { key: "id", label: "Action", render: (_v, row) => (
                    <div style={{ display: "flex", gap: 6 }}>
                      <InlineConfirmAction label="Approve" disabled={!handlers.canAction("aggregate_demands")} onConfirm={() => handlers.onApproveDemandReview(row.id, {})} />
                      <InlineConfirmAction label="Reject" disabled={!handlers.canAction("aggregate_demands")} onConfirm={() => handlers.onRejectDemandReview(row.id, {})} />
                    </div>
                  ) }
                ]}
                rows={reviewQueueDisplay}
              />
            </TableCard>
          ) : null}
          <TableCard title="Input Demand Feed" collapsible>
            <DataTable
              enableSearch
              enableFilters
              columns={[
                { key: "id", label: "Demand ID" },
                { key: "farmer_id", label: "Farmer" },
                { key: "item_name", label: "Item" },
                { key: "requested_qty", label: "Qty", disableFilter: true },
                { key: "crop", label: "Crop" },
                { key: "source", label: "Source", render: (value) => <span className={`badge ${value === "farmer_chat" ? "tone-info" : "tone-neutral"}`}>{value === "farmer_chat" ? "Farmer Chat" : "Manual"}</span> },
                { key: "status", label: "Status", render: (value) => <SeverityBadge value={value} /> }
              ]}
              rows={demandsDisplay}
            />
          </TableCard>
        </div>
      ) : null}
      {tab === "procurement" ? (
        <div className="stack">
          {!workboardCollapsed ? (
            <div className="queue-board">
              <QueueBoardColumn
                title="Needs approval"
                count={openPurchaseRequests.length}
                tone={openPurchaseRequests.length ? "high" : "normal"}
                action={<button type="button" className="btn-primary btn-small" onClick={() => setDrawer("pr")} disabled={!handlers.canAction("create_pr")}>Create PR</button>}
              >
                <BulkBar
                  count={prSelection.count}
                  onClear={prSelection.clear}
                  actions={[
                    { label: `Approve ${prSelection.count}`, tone: "primary", disabled: !handlers.canAction("approve_pr"), onClick: async () => {
                      await handlers.onBulkApprovePurchaseRequests(prSelection.ids);
                      prSelection.clear();
                    }}
                  ]}
                />
                <div className="queue-action-list">
                  {openPurchaseRequests.length ? openPurchaseRequests.map((row) => (
                    <QueueActionRow
                      key={row.id}
                      id={row.id}
                      selected={prSelection.selected.has(row.id)}
                      onSelect={() => prSelection.toggle(row.id)}
                      title={row.item_name}
                      meta={joinParts([row.id, `${number(row.total_qty)} qty`, row.supplier_name])}
                      detail={`${Array.isArray(row.input_demand_ids) ? row.input_demand_ids.length : 0} linked demand lines`}
                      chips={[<span className="queue-inline-stat" key="linked">Linked {Array.isArray(row.input_demand_ids) ? row.input_demand_ids.length : 0}</span>]}
                      action={row.approval_status !== "approved" ? <InlineConfirmAction label="Approve" disabled={!handlers.canAction("approve_pr")} onConfirm={() => handlers.onApprovePurchaseRequest(row.id)} /> : <span className="queue-inline-done">Done</span>}
                    />
                  )) : <div className="queue-empty">No purchase requests are waiting approval.</div>}
                </div>
              </QueueBoardColumn>

              <QueueBoardColumn
                title="Ordered"
                count={inFlightPurchaseOrders.length}
                tone={inFlightPurchaseOrders.length ? "medium" : "normal"}
              >
                <div className="queue-action-list">
                  {inFlightPurchaseOrders.length ? inFlightPurchaseOrders.map((row) => (
                    <QueueActionRow
                      key={row.id}
                      title={row.item_name}
                      meta={joinParts([row.id, `${number(row.qty_ordered)} qty`, row.order_date || "No date"])}
                      detail={joinParts([row.pr_id ? `PR ${row.pr_id}` : null, row.supplier_id ? `Supplier ${row.supplier_id}` : null])}
                      chips={[<SeverityBadge key="status" value={row.delivery_status} />]}
                    />
                  )) : <div className="queue-empty">No purchase orders are in flight.</div>}
                </div>
              </QueueBoardColumn>
            </div>
          ) : null}
          <TableCard title="PR history" collapsible><DataTable columns={[{ key: "id", label: "PR ID" }, { key: "item_name", label: "Item" }, { key: "total_qty", label: "Qty" }, { key: "supplier_name", label: "Supplier" }, { key: "approval_status", label: "Status", render: (value) => <SeverityBadge value={value} /> }]} rows={purchaseRequests} /></TableCard>
          <TableCard title="Receipt history" collapsible><DataTable columns={[{ key: "id", label: "GRN" }, { key: "po_id", label: "PO" }, { key: "item_name", label: "Item" }, { key: "qty_received", label: "Received" }, { key: "receipt_date", label: "Date" }]} rows={goodsReceipts} /></TableCard>
        </div>
      ) : null}
      {tab === "inventory" ? (
        <div className="stack">
          {!workboardCollapsed ? <div className="workboard-grid">
            <WorkboardCard eyebrow="Watchlist" title="Low-stock items" subtitle="Stock risk stays visible before it becomes a farmer-facing delay." count={lowStockRows.length} tone={lowStockRows.length ? "high" : "normal"} action={<button type="button" className="btn-primary btn-small" onClick={() => setDrawer("issue")} disabled={!handlers.canAction("issue_inputs")}>Issue Inputs</button>}>
              <div className="workboard-list">
                {lowStockRows.length ? recentRows(lowStockRows, [], 4).map((row) => (
                  <WorkboardItem
                    key={`${row.fpo_id}-${row.item_name}`}
                    title={row.item_name}
                    meta={`${row.fpo_id} · ${number(row.current_stock || 0)} left`}
                    detail="Inventory level is below the expected comfort band."
                    chips={[<SeverityBadge key="status" value={row.stock_status} />]}
                  />
                )) : <div className="queue-empty">No low-stock alerts right now.</div>}
              </div>
            </WorkboardCard>

            <WorkboardCard eyebrow="Recent Moves" title="Latest stock ledger entries" subtitle="Newest inventory movements are surfaced separately from the full ledger." count={inventoryTransactions.length}>
              <div className="workboard-list">
                {recentInventoryMoves.length ? recentInventoryMoves.map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${row.item_name} · ${number(row.qty || 0)}`}
                    meta={`${titleCase(row.txn_type)} · ${row.txn_date || "No date"}`}
                    detail={`Reference ${row.reference_id}${row.fpo_id ? ` · ${row.fpo_id}` : ""}`}
                    chips={[<QueueFreshTag key="fresh" />]}
                  />
                )) : <div className="queue-empty">No recent ledger movement yet.</div>}
              </div>
            </WorkboardCard>

            <WorkboardCard eyebrow="Issues" title="Recently issued input lines" subtitle="Fresh issues remain visible even after the stock count changes." count={inputIssues.length}>
              <div className="workboard-list">
                {recentInputIssues.length ? recentInputIssues.map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${row.item_name || row.item_id || "Input"} issued`}
                    meta={`${row.farmer_id || "Unknown farmer"} · ${number(row.qty_issued || 0)} qty`}
                    detail={`${row.issue_date || "No date"}${row.fpo_id ? ` · ${row.fpo_id}` : ""}`}
                    chips={[row.created_by_agent ? <span className="badge badge-info" key="agent">Agent</span> : <QueueFreshTag key="fresh" />]}
                  />
                )) : <div className="queue-empty">No input issues have been recorded yet.</div>}
              </div>
            </WorkboardCard>
          </div> : null}

          <TableCard title="Inventory Snapshot" collapsible><DataTable columns={[{ key: "fpo_id", label: "FPO" }, { key: "item_name", label: "Item" }, { key: "current_stock", label: "Stock" }, { key: "stock_status", label: "Status", render: (value) => <SeverityBadge value={value} /> }]} rows={inventory} /></TableCard>
          <TableCard title="Inventory Ledger" collapsible><DataTable columns={[{ key: "txn_date", label: "Date" }, { key: "item_name", label: "Item" }, { key: "txn_type", label: "Type" }, { key: "qty", label: "Qty" }, { key: "reference_id", label: "Reference" }]} rows={inventoryTransactions} /></TableCard>
        </div>
      ) : null}
      {tab === "collections" ? (
        <div className="stack">
          {!workboardCollapsed ? <div className="workboard-grid">
            <WorkboardCard eyebrow="Fresh Intake" title="Newest produce collections" subtitle="New harvest intake is surfaced separately from the full collection history." count={collections.length} tone="medium" action={<button type="button" className="btn-primary btn-small" onClick={() => setDrawer("collection")} disabled={!handlers.canAction("record_collection")}>Record Collection</button>}>
              <div className="workboard-list">
                {recentCollections.length ? recentCollections.map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${row.farmer_name} · ${row.crop}`}
                    meta={`${number(row.quantity_qtl || 0, 1)} qtl · Grade ${row.grade} · ${row.date || "No date"}`}
                    detail={`${row.collection_center || "No center"}${row.moisture_pct != null ? ` · ${number(row.moisture_pct, 1)}% moisture` : ""}`}
                    chips={[
                      <QueueFreshTag key="fresh" />,
                      row.created_by_agent ? <span className="badge badge-info" key="agent">Agent</span> : null,
                      <SeverityBadge key="status" value={row.status} />
                    ].filter(Boolean)}
                  />
                )) : <div className="queue-empty">No recent produce intake yet.</div>}
              </div>
            </WorkboardCard>

            <WorkboardCard eyebrow="Not Allocated" title="Collections still waiting for market linkage" subtitle="Unallocated harvest stays visible so market action can happen before produce goes stale." count={unallocatedCollections.length} tone={unallocatedCollections.length ? "high" : "normal"}>
              <div className="workboard-list">
                {unallocatedCollections.length ? recentRows(unallocatedCollections, ["date"], 4).map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${row.crop} from ${row.farmer_name}`}
                    meta={`${number(row.quantity_qtl || 0, 1)} qtl · ${row.date || "No date"}`}
                    detail={`Collection ${row.id}${row.grade ? ` · Grade ${row.grade}` : ""}`}
                    chips={[<SeverityBadge key="status" value={row.status} />]}
                  />
                )) : <div className="queue-empty">Everything recent is already linked to market demand.</div>}
              </div>
            </WorkboardCard>

          </div> : null}

          <TableCard title="Produce Collections" collapsible><DataTable columns={[{ key: "id", label: "Collection" }, { key: "farmer_name", label: "Farmer" }, { key: "crop", label: "Crop" }, { key: "quantity_qtl", label: "Qty (qtl)" }, { key: "grade", label: "Grade" }, { key: "status", label: "Status", render: (value) => <SeverityBadge value={value} /> }]} rows={collections} /></TableCard>
        </div>
      ) : null}
      {tab === "settlements" ? (
        <div className="stack">
          {!workboardCollapsed ? <div className="workboard-grid">
            <WorkboardCard eyebrow="Pending Payouts" title="Farmer settlements waiting release" subtitle="The payout queue is surfaced first so new release obligations are obvious." count={pendingSettlementRows.length} tone={pendingSettlementRows.length ? "high" : "normal"} action={<button type="button" className="btn-primary btn-small" onClick={() => handlers.onGenerateSettlements({})} disabled={!handlers.canAction("generate_settlements")}>Generate</button>}>
              <div className="workboard-list">
                {pendingSettlementRows.length ? recentRows(pendingSettlementRows, [], 4).map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${row.id} · ${currency(row.net_amount)}`}
                    meta={`${row.farmer_id} · ${row.crop}`}
                    detail={`Collection ${row.collection_id}${row.sales_order_id ? ` · Sales order ${row.sales_order_id}` : ""}`}
                    chips={[
                      <QueueFreshTag key="fresh" />,
                      <SeverityBadge key="status" value={row.payment_status} />
                    ]}
                    action={row.payment_status !== "paid" ? <InlineConfirmAction label="Mark Paid" disabled={!handlers.canAction("release_settlement") || !canMarkSettlementPaid(row, marketSalesOrders)} onConfirm={() => handlers.onMarkSettlementPaid(row.id)} /> : null}
                  />
                )) : <div className="queue-empty">No settlements are waiting release.</div>}
              </div>
            </WorkboardCard>

            <WorkboardCard eyebrow="Approvals" title="Approval items affecting cash release" subtitle="Approval decisions are kept visible alongside settlements so the blocker is obvious." count={pendingApprovals.length} tone={pendingApprovals.length ? "medium" : "normal"}>
              <div className="workboard-list">
                {pendingApprovals.length ? recentRows(pendingApprovals, ["requested_at"], 4).map((row) => (
                  <WorkboardItem
                    key={row.id}
                    title={`${titleCase(row.approval_type)} · ${row.entity_id}`}
                    meta={`${row.id} · ${compactDateTime(row.requested_at)}`}
                    detail={row.notes || "Pending approval decision"}
                    chips={[
                      <QueueFreshTag key="fresh" />,
                      <SeverityBadge key="status" value={row.status} />
                    ]}
                    action={<InlineConfirmAction label="Approve" disabled={!handlers.canAction("decide_approvals")} onConfirm={() => handlers.onDecideApproval(row.id, "approved")} />}
                  />
                )) : <div className="queue-empty">No approvals are blocking release right now.</div>}
              </div>
            </WorkboardCard>

          </div> : null}

          <TableCard title={`Pending Settlements — ${pendingSettlementRows.length}`}>
            <BulkBar
              count={settlementSelection.count}
              onClear={settlementSelection.clear}
              actions={[
                { label: `Mark ${settlementSelection.count} paid`, tone: "primary", disabled: !handlers.canAction("release_settlement"), onClick: async () => {
                  await handlers.onBulkMarkSettlementsPaid(settlementSelection.ids);
                  settlementSelection.clear();
                }}
              ]}
            />
            <div className="queue-action-list">
              {pendingSettlementRows.length ? pendingSettlementRows.map((row) => (
                <QueueActionRow
                  key={row.id}
                  id={row.id}
                  selected={settlementSelection.selected.has(row.id)}
                  onSelect={() => { if (canMarkSettlementPaid(row, marketSalesOrders)) settlementSelection.toggle(row.id); }}
                  title={joinParts([row.farmer_id, currency(row.net_amount)])}
                  meta={joinParts([row.crop, row.id])}
                  detail={row.sales_order_id ? `Sales order ${row.sales_order_id}` : `Collection ${row.collection_id}`}
                  action={row.payment_status !== "paid" ? <InlineConfirmAction label="Mark Paid" disabled={!handlers.canAction("release_settlement") || !canMarkSettlementPaid(row, marketSalesOrders)} onConfirm={() => handlers.onMarkSettlementPaid(row.id)} /> : <span className="queue-inline-done">Done</span>}
                />
              )) : <div className="queue-empty">No settlements are waiting release.</div>}
            </div>
          </TableCard>
          <TableCard title="All Settlements" collapsible><DataTable columns={[{ key: "id", label: "Settlement" }, { key: "farmer_id", label: "Farmer" }, { key: "crop", label: "Crop" }, { key: "net_amount", label: "Net", render: (value) => currency(value) }, { key: "payment_status", label: "Status", render: (value) => <SeverityBadge value={value} /> }]} rows={settlementsDisplay} /></TableCard>
          <TableCard title="Approval Queue" collapsible><DataTable columns={[{ key: "id", label: "Approval ID" }, { key: "approval_type", label: "Type" }, { key: "entity_id", label: "Entity" }, { key: "status", label: "Status", render: (value) => <SeverityBadge value={value} /> }, { key: "id", label: "Action", render: (_value, row) => row.status === "pending" ? <InlineConfirmAction label="Approve" disabled={!handlers.canAction("decide_approvals")} onConfirm={() => handlers.onDecideApproval(row.id, "approved")} /> : "Closed" }]} rows={approvalQueue.slice(0, 12)} /></TableCard>
        </div>
      ) : null}

      <Drawer open={drawer === "aggregate"} title="Aggregate Demands" subtitle="Roll up farmer requests (same FPO + item) into one procurement-ready line." onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onAggregateDemands({ fpo_id: aggregateForm.fpo_id, item_id: aggregateForm.item_id }), () => setDrawer("")); }}><label><span>FPO</span><select value={aggregateForm.fpo_id} onChange={(event) => setAggregateForm({ ...aggregateForm, fpo_id: event.target.value })}>{(lookups.fpos || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Input item</span><select value={aggregateForm.item_id} onChange={(event) => setAggregateForm({ ...aggregateForm, item_id: event.target.value })}>{(lookups.inputs || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Matching captured rows</span><input value={number(capturedDemands.filter((r) => r.fpo_id === aggregateForm.fpo_id && r.item_id === aggregateForm.item_id).length)} readOnly /></label><label><span>Total qty to procure</span><input value={number(capturedDemands.filter((r) => r.fpo_id === aggregateForm.fpo_id && r.item_id === aggregateForm.item_id).reduce((s, r) => s + Number(r.requested_qty || 0), 0))} readOnly /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Aggregate</button></div></form></Drawer>
      <Drawer open={drawer === "pr"} title="Create Purchase Request" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); const candidateDemandIds = demands.filter((row) => row.fpo_id === prForm.fpo_id && row.item_id === prForm.item_id && row.status === "aggregated").map((row) => row.id).slice(0, 25); submitAndMaybeClose(handlers.onCreatePurchaseRequest({ ...prForm, total_qty: Number(prForm.total_qty), input_demand_ids: candidateDemandIds }), () => setDrawer("")); }}><label><span>FPO</span><select value={prForm.fpo_id} onChange={(event) => setPrForm({ ...prForm, fpo_id: event.target.value })}>{(lookups.fpos || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Item</span><select value={prForm.item_id} onChange={(event) => setPrForm({ ...prForm, item_id: event.target.value })}>{(lookups.inputs || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Quantity</span><input type="number" value={prForm.total_qty} onChange={(event) => setPrForm({ ...prForm, total_qty: event.target.value })} /></label><label><span>Supplier</span><select value={prForm.supplier_id} onChange={(event) => setPrForm({ ...prForm, supplier_id: event.target.value })}>{(lookups.suppliers || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Submit PR</button></div></form></Drawer>
      <Drawer open={drawer === "grn"} title="Create Goods Receipt" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateGoodsReceipt({ po_id: grnForm.po_id, qty_received: Number(grnForm.qty_received), damaged_qty: Number(grnForm.damaged_qty) }), () => setDrawer("")); }}><label><span>PO ID</span><input value={grnForm.po_id} onChange={(event) => setGrnForm({ ...grnForm, po_id: event.target.value })} required /></label><label><span>Qty received</span><input type="number" value={grnForm.qty_received} onChange={(event) => setGrnForm({ ...grnForm, qty_received: event.target.value })} required /></label><label><span>Damaged qty</span><input type="number" value={grnForm.damaged_qty} onChange={(event) => setGrnForm({ ...grnForm, damaged_qty: event.target.value })} /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Submit GRN</button></div></form></Drawer>
      <Drawer open={drawer === "issue"} title="Issue Inputs" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateInputIssue({ ...issueForm, qty_issued: Number(issueForm.qty_issued) }), () => setDrawer("")); }}><label><span>Farmer</span><select value={issueForm.farmer_id} onChange={(event) => setIssueForm({ ...issueForm, farmer_id: event.target.value })}>{(lookups.farmers || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Item</span><select value={issueForm.item_id} onChange={(event) => setIssueForm({ ...issueForm, item_id: event.target.value })}>{(lookups.inputs || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Qty issued</span><input type="number" value={issueForm.qty_issued} onChange={(event) => setIssueForm({ ...issueForm, qty_issued: event.target.value })} /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Issue stock</button></div></form></Drawer>
      <Drawer open={drawer === "collection"} title="Record Produce Collection" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateProduceCollection({ ...collectionForm, quantity_qtl: Number(collectionForm.quantity_qtl), moisture_pct: Number(collectionForm.moisture_pct) }), () => setDrawer("")); }}><label><span>Farmer</span><select value={collectionForm.farmer_id} onChange={(event) => setCollectionForm({ ...collectionForm, farmer_id: event.target.value })}>{(lookups.farmers || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Crop</span><input value={collectionForm.crop} onChange={(event) => setCollectionForm({ ...collectionForm, crop: event.target.value })} /></label><label><span>Quantity (qtl)</span><input type="number" value={collectionForm.quantity_qtl} onChange={(event) => setCollectionForm({ ...collectionForm, quantity_qtl: event.target.value })} /></label><label><span>Grade</span><select value={collectionForm.grade} onChange={(event) => setCollectionForm({ ...collectionForm, grade: event.target.value })}><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></label><label><span>Moisture %</span><input type="number" step="0.1" value={collectionForm.moisture_pct} onChange={(event) => setCollectionForm({ ...collectionForm, moisture_pct: event.target.value })} /></label><label><span>Collection center</span><input value={collectionForm.collection_center} onChange={(event) => setCollectionForm({ ...collectionForm, collection_center: event.target.value })} /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Record collection</button></div></form></Drawer>
    </div>
  );
}

function MarketSection({ sectionData, handlers }) {
  const prices = sliceRows(sectionData.prices);
  const buyers = sliceRows(sectionData.buyers);
  const buyerDemands = sliceRows(sectionData.demands);
  const matching = sliceRows(sectionData.matching);
  const salesOrders = sliceRows(sectionData.salesOrders);
  const dispatches = sliceRows(sectionData.dispatches);
  const collections = sliceRows(sectionData.collections);
  const settlements = sliceRows(sectionData.settlements);
  const approvals = sliceRows(sectionData.approvals);
  const agentActivity = sectionData.agentActivity || {};
  const [agentBusy, setAgentBusy] = useState(false);
  const handleRunAgentCycle = async () => {
    if (!handlers.onRunAgentCycle) return;
    setAgentBusy(true);
    try { await handlers.onRunAgentCycle({}); } finally { setAgentBusy(false); }
  };
  const [drawer, setDrawer] = useState("");
  const [tab, setTab] = useState("tracker");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedMatchKey, setSelectedMatchKey] = useState("");
  const [matchMinScore, setMatchMinScore] = useState(0);
  const [matchCropFilter, setMatchCropFilter] = useState("");
  const [trackerQuery, setTrackerQuery] = useState("");
  const [trackerActiveId, setTrackerActiveId] = useState(null);
  const [buyerDemandForm, setBuyerDemandForm] = useState({ buyer_id: buyers[0]?.id || "", crop: "Tomato", quantity_mt: "55", offered_price: "2250", delivery_location: buyers[0]?.district || "Pune" });
  const [salesOrderForm, setSalesOrderForm] = useState({ buyer_id: buyers[0]?.id || "", crop: "Tomato", quantity_mt: "40", price: "2250", buyer_demand_id: "", collection_ids: [] });
  const [dispatchForm, setDispatchForm] = useState({ sales_order_id: salesOrders[0]?.id || "", qty_dispatched_mt: "22", vehicle_no: "MH-12-4587" });

  useEffect(() => {
    if (!buyerDemandForm.buyer_id && buyers[0]?.id) setBuyerDemandForm((current) => ({ ...current, buyer_id: buyers[0].id, delivery_location: buyers[0].district }));
    if (!salesOrderForm.buyer_id && buyers[0]?.id) setSalesOrderForm((current) => ({ ...current, buyer_id: buyers[0].id }));
    if (!dispatchForm.sales_order_id && salesOrders[0]?.id) setDispatchForm((current) => ({ ...current, sales_order_id: salesOrders[0].id }));
  }, [buyerDemandForm.buyer_id, buyers, dispatchForm.sales_order_id, salesOrderForm.buyer_id, salesOrders]);

  const openBuyerDemands = buyerDemands.filter((row) => row.status === "open");
  const orderAttentionRows = salesOrders.filter((row) => salesOrderNeedsAttention(row, dispatches));
  const activeDispatchRows = recentRows(dispatches.filter((row) => row.delivery_status !== "delivered"), ["dispatch_date"], 4);
  const pendingApprovals = approvals.filter((row) => row.status === "pending");
  const pendingSettlements = settlements.filter((row) => row.payment_status === "pending");
  const recentBuyerDemands = recentRows(openBuyerDemands, ["required_date"], 4);
  const recentOrderAttention = recentRows(orderAttentionRows, ["created_date"], 4);

  const rankedMatches = useMemo(() => [...matching].sort((l, r) => Number(r.match_score || 0) - Number(l.match_score || 0)), [matching]);
  const cropOptions = useMemo(() => [...new Set(rankedMatches.map((m) => m.crop).filter(Boolean))], [rankedMatches]);
  const filteredMatches = useMemo(() => rankedMatches.filter((m) => {
    if (matchCropFilter && m.crop !== matchCropFilter) return false;
    if (Number(m.match_score || 0) * 100 < matchMinScore) return false;
    return true;
  }), [rankedMatches, matchCropFilter, matchMinScore]);

  const selectedMatch = filteredMatches.find((m) => `${m.buyer_demand_id}-${m.fpo_name}` === selectedMatchKey) || filteredMatches[0];

  const tabs = [
    { id: "tracker", label: "Tracker", count: openBuyerDemands.length + orderAttentionRows.length + pendingSettlements.length, tone: (orderAttentionRows.length || pendingSettlements.length) ? "high" : openBuyerDemands.length ? "medium" : "neutral", hint: "1" },
    { id: "matching", label: "Matching", count: filteredMatches.length, tone: filteredMatches.length ? "medium" : "neutral", hint: "2" },
    { id: "demand", label: "Buyer Demand", count: openBuyerDemands.length, tone: openBuyerDemands.length ? "medium" : "neutral", hint: "3" },
    { id: "orders", label: "Sales Orders", count: orderAttentionRows.length, tone: orderAttentionRows.length ? "high" : "neutral", hint: "4" },
    { id: "dispatch", label: "Dispatches", count: activeDispatchRows.length, tone: activeDispatchRows.length ? "medium" : "neutral", hint: "5" },
    { id: "prices", label: "Reference", count: null, hint: "6" }
  ];

  useHotkeys([
    { key: "k", ctrl: true, handler: () => setPaletteOpen(true) },
    { key: "Escape", allowInInputs: true, handler: () => { if (drawer) setDrawer(""); if (paletteOpen) setPaletteOpen(false); } },
    { key: "Enter", ctrl: true, allowInInputs: true, handler: () => {
      const f = document.querySelector(".drawer.open form");
      if (f) f.requestSubmit();
    }},
    { key: "j", handler: () => {
      if (tab !== "matching") return;
      const idx = filteredMatches.findIndex((m) => `${m.buyer_demand_id}-${m.fpo_name}` === selectedMatchKey);
      const next = filteredMatches[Math.min(filteredMatches.length - 1, (idx < 0 ? 0 : idx + 1))];
      if (next) setSelectedMatchKey(`${next.buyer_demand_id}-${next.fpo_name}`);
    }},
    { key: "k", handler: () => {
      if (tab !== "matching") return;
      const idx = filteredMatches.findIndex((m) => `${m.buyer_demand_id}-${m.fpo_name}` === selectedMatchKey);
      const prev = filteredMatches[Math.max(0, idx - 1)];
      if (prev) setSelectedMatchKey(`${prev.buyer_demand_id}-${prev.fpo_name}`);
    }}
  ]);

  const acceptMatch = (row) => {
    if (!row || !handlers.canAction("create_sales_order")) return;
    setSalesOrderForm({
      buyer_id: buyers.find((b) => b.name === row.buyer_name)?.id || salesOrderForm.buyer_id,
      crop: row.crop,
      quantity_mt: String(row.required_mt),
      price: String(row.offered_price),
      buyer_demand_id: row.buyer_demand_id,
      collection_ids: []
    });
    setDrawer("sales");
  };

  const commands = useMemo(() => {
    const list = tabs.map((t) => ({ id: `tab-${t.id}`, group: "Tab", label: `Go to ${t.label}`, run: () => setTab(t.id) }));
    list.push({ id: "act-buyer", group: "Action", label: "Add Buyer Demand", run: () => setDrawer("buyer") });
    list.push({ id: "act-sales", group: "Action", label: "Create Sales Order", run: () => setDrawer("sales") });
    list.push({ id: "act-dispatch", group: "Action", label: "Create Dispatch", run: () => setDrawer("dispatch") });
    rankedMatches.slice(0, 15).forEach((m) => list.push({
      id: `m-${m.buyer_demand_id}-${m.fpo_name}`,
      group: "Match",
      label: `Accept ${m.crop} — ${m.buyer_name}`,
      hint: `${Math.round(Number(m.match_score || 0) * 100)}% · ${m.fpo_name}`,
      run: () => acceptMatch(m)
    }));
    orderAttentionRows.filter((o) => canMarkSalesOrderPaid(o, dispatches)).slice(0, 10).forEach((o) => list.push({
      id: `so-${o.id}`,
      group: "Sales Order",
      label: `Mark ${o.id} paid`,
      hint: `${o.buyer_name} · ${currency(o.price)}`,
      run: () => handlers.onMarkSalesOrderPaid(o.id)
    }));
    return list;
  }, [dispatches, handlers, orderAttentionRows, rankedMatches, tab]);

  const marketTrackerItems = useMemo(() => {
    const items = [];
    const salesOrderApprovals = pendingApprovals.filter((row) => row.approval_type === "sales_order");
    const settlementReleaseApprovals = pendingApprovals.filter((row) => row.approval_type === "settlement_release");

    openBuyerDemands.forEach((row) => {
      const relatedMatch = rankedMatches.find((entry) => entry.buyer_demand_id === row.id);
      const matchPct = relatedMatch ? Math.round(Number(relatedMatch.match_score || 0) * 100) : 0;
      const qtyMt = Number(row.quantity_mt || 0);
      // Agent will auto-create sales order on next cycle when there is produce + live demand.
      // Human gate only triggers if sales order qty will exceed threshold.
      const willNeedApproval = qtyMt >= AGENT_THRESHOLDS.SALES_AUTO_QTY;
      const automation = relatedMatch && !willNeedApproval ? "auto" : relatedMatch ? "escalated" : "manual";
      items.push({
        id: row.id,
        kind: "Buyer demand",
        title: row.buyer_name,
        subtitle: joinParts([row.crop, `${number(row.quantity_mt || 0)} MT`, currency(row.offered_price)]),
        stage: relatedMatch ? (willNeedApproval ? "Needs approval" : "Ready to match") : "Demand open",
        tone: willNeedApproval ? "high" : relatedMatch ? "medium" : "neutral",
        bucket: willNeedApproval ? "action" : relatedMatch ? "action" : "watch",
        automation,
        current: relatedMatch ? `A ${matchPct}% match is available.` : "Buyer demand is open and still waiting for a viable supply match.",
        next: willNeedApproval
          ? `Approve the ${qtyMt} MT order (above ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm limit)`
          : relatedMatch
            ? "Market Allocation Agent will create the sales order"
            : "Wait for supply or review lower-confidence matches",
        why: willNeedApproval
          ? `Order size ${qtyMt} MT is above the ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-approve cap. Agent drafted the order but cannot self-confirm.`
          : relatedMatch
            ? "Within auto-thresholds — next agent cycle will pick this up."
            : "No live supply matches this demand yet.",
        agentStopReason: willNeedApproval ? `Quantity ${qtyMt} MT ≥ ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm cap` : null,
        owner: willNeedApproval ? "Approvals desk" : "Market Allocation Agent",
        linked: [
          { label: "Buyer", value: row.buyer_name || "-" },
          { label: "Best match", value: relatedMatch ? `${matchPct}%` : "None" }
        ],
        actions: [
          relatedMatch ? { label: "Open matching", variant: "ghost", onClick: () => setTab("matching") } : { label: "Buyer demand tab", variant: "ghost", onClick: () => setTab("demand") }
        ]
      });
    });

    orderAttentionRows.forEach((row) => {
      const dispatch = dispatches.find((entry) => entry.sales_order_id === row.id);
      const salesApproval = salesOrderApprovals.find((entry) => entry.entity_id === row.id);
      const releaseApproval = settlementReleaseApprovals.find((entry) => entry.entity_id === row.id);
      const linkedSettlement = settlements.find((entry) => entry.sales_order_id === row.id);
      const approvalPending = isApprovalPending(row.approval_status);
      const paymentPending = row.payment_status !== "received";
      const dispatchPending = isApprovalCleared(row.approval_status) && !dispatch;
      const readyForPayment = canMarkSalesOrderPaid(row, dispatches);
      const fromAgent = Boolean(row.created_by_agent) || row.source === "agent";
      const qtyMt = Number(row.quantity_mt || 0);
      const stage = approvalPending ? "Needs approval" : dispatchPending ? "Ready to dispatch" : paymentPending ? "Payment pending" : "In motion";
      // Classification:
      // - approvalPending: escalated (human must approve; agent cannot self-approve over threshold)
      // - dispatchPending: auto (agent creates dispatch on next cycle once approved)
      // - paymentPending: auto (waits on external buyer remittance — not a human task)
      // - in motion: auto
      const automation = approvalPending ? "escalated" : "auto";
      const actions = [];
      if (approvalPending && salesApproval) {
        actions.push({ label: "Approve order", onClick: () => handlers.onDecideApproval(salesApproval.id, "approved"), disabled: !handlers.canAction("decide_approvals") });
      }
      if (dispatchPending && !fromAgent) {
        actions.push({
          label: "Create dispatch",
          onClick: () => {
            setDispatchForm((current) => ({ ...current, sales_order_id: row.id, qty_dispatched_mt: String(Math.round(Number(row.quantity_mt || 0))) }));
            setTab("dispatch");
            setDrawer("dispatch");
          },
          disabled: !handlers.canAction("create_dispatch")
        });
      }
      if (readyForPayment) {
        actions.push({ label: "Mark paid", onClick: () => handlers.onMarkSalesOrderPaid(row.id), disabled: !handlers.canAction("mark_sales_paid") });
      }
      if (releaseApproval) {
        actions.push({ label: "Approve payout release", onClick: () => handlers.onDecideApproval(releaseApproval.id, "approved"), disabled: !handlers.canAction("decide_approvals") });
      } else if (linkedSettlement && linkedSettlement.payment_status !== "paid") {
        actions.push({ label: "Open payouts", variant: "ghost", onClick: () => handlers.onSetActive("operations") });
      }

      items.push({
        id: row.id,
        kind: "Sales order",
        title: row.buyer_name,
        subtitle: joinParts([row.crop, `${number(row.quantity_mt || 0)} MT`, currency(row.price)]),
        stage,
        tone: approvalPending ? "high" : dispatchPending || paymentPending ? "medium" : "medium",
        bucket: approvalPending ? "action" : "waiting",
        automation,
        current: approvalPending
          ? "Order exists but is still waiting on office approval."
          : dispatchPending
            ? "Order is approved and still missing a dispatch record."
            : paymentPending
              ? "Order is approved and dispatched, but buyer payment is still pending."
              : "Order is moving through downstream execution.",
        next: approvalPending
          ? `Approve the ${qtyMt} MT order (above ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm limit)`
          : dispatchPending
            ? "Market Allocation Agent will create the dispatch"
            : paymentPending
              ? "Waiting on buyer remittance"
              : "Monitor delivery and settlement release",
        why: approvalPending
          ? `Order quantity ${qtyMt} MT is above the ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-approve cap.${fromAgent ? " Agent drafted this order but cannot self-confirm at this size." : ""}`
          : dispatchPending
            ? "Agent picks this up on the next cycle."
            : paymentPending
              ? "Nothing human can speed this up — buyer payment clears or the finance agent chases it."
              : "Downstream agent tasks are handling this automatically.",
        agentStopReason: approvalPending ? `Quantity ${qtyMt} MT ≥ ${AGENT_THRESHOLDS.SALES_AUTO_QTY} MT auto-confirm cap` : null,
        owner: approvalPending ? "Approvals desk" : dispatchPending ? "Market Allocation Agent" : paymentPending ? "Buyer / Finance Agent" : "Execution Agent",
        linked: [
          { label: "Dispatch", value: dispatch?.id || "Not created" },
          { label: "Settlement", value: linkedSettlement?.id || "Not generated" }
        ],
        actions
      });
    });

    dispatches.filter((row) => row.delivery_status !== "delivered").forEach((row) => {
      items.push({
        id: row.id,
        kind: "Dispatch",
        title: row.sales_order_id,
        subtitle: joinParts([`${number(row.qty_dispatched_mt || 0)} MT`, row.vehicle_no]),
        stage: "In transit",
        tone: "medium",
        bucket: "waiting",
        automation: "auto",
        current: "The truck is already on the road and the order is in execution.",
        next: "Waiting for delivery confirmation",
        why: "Execution Agent is tracking this; no human action needed until delivery is disputed.",
        owner: "Execution Agent",
        linked: [
          { label: "Sales order", value: row.sales_order_id || "-" },
          { label: "Delivery", value: String(row.delivery_status || "-").replaceAll("_", " ") }
        ],
        actions: [{ label: "Dispatch tab", variant: "ghost", onClick: () => setTab("dispatch") }]
      });
    });

    pendingSettlements.forEach((row) => {
      const releaseApproval = settlementReleaseApprovals.find((entry) => entry.entity_id === row.sales_order_id);
      const linkedSalesOrder = salesOrders.find((entry) => entry.id === row.sales_order_id);
      const buyerPaymentPending = linkedSalesOrder ? !isPaymentReceived(linkedSalesOrder.payment_status) : false;
      const releaseRejected = linkedSalesOrder ? String(linkedSalesOrder.settlement_release_status || "").toLowerCase() === "rejected" : false;
      const payoutReady = canMarkSettlementPaid(row, salesOrders);
      // Escalated only if a human release approval is pending, or rejected/blocked.
      // Buyer-payment-pending and payout-ready are auto (agent wrote settlement; waits on cash-in or releases on next cycle).
      const automation = releaseApproval || releaseRejected ? "escalated" : "auto";
      items.push({
        id: row.id,
        kind: "Farmer payout",
        title: row.farmer_id,
        subtitle: joinParts([row.crop, currency(row.net_amount)]),
        stage: releaseApproval ? "Awaiting release approval" : buyerPaymentPending ? "Awaiting buyer payment" : releaseRejected ? "Release blocked" : "Awaiting payout",
        tone: releaseApproval || releaseRejected ? "high" : "medium",
        bucket: releaseApproval || releaseRejected ? "action" : "waiting",
        automation,
        current: releaseApproval
          ? "Settlement is created and blocked behind release approval."
          : buyerPaymentPending
            ? "Settlement is linked to a sales order that is still waiting on buyer payment."
            : releaseRejected
              ? "Settlement release was rejected and payout cannot proceed yet."
              : "Settlement is created and still unpaid.",
        next: releaseApproval
          ? "Approve payout release"
          : releaseRejected
            ? "Clear the payout release block"
            : buyerPaymentPending
              ? "Waiting on buyer remittance"
              : "Finance Agent will release on next cycle",
        why: releaseApproval
          ? "Agent flagged this for human release approval — cash movement above policy threshold requires sign-off."
          : releaseRejected
            ? "Agent cannot unblock a rejected release; a human must reopen the decision."
            : buyerPaymentPending
              ? "Nothing human can speed this — buyer payment clears or Finance Agent chases it."
              : "Finance Agent will release this settlement on its next cycle.",
        agentStopReason: releaseApproval
          ? "Release approval policy requires human sign-off"
          : releaseRejected
            ? "Release was rejected — agent cannot self-reopen"
            : null,
        owner: releaseApproval || releaseRejected ? "Approvals desk" : buyerPaymentPending ? "Buyer / Finance Agent" : "Finance Agent",
        linked: [
          { label: "Sales order", value: row.sales_order_id || "-" },
          { label: "Collection", value: row.collection_id || "-" }
        ],
        actions: releaseApproval
          ? [{ label: "Approve release", onClick: () => handlers.onDecideApproval(releaseApproval.id, "approved"), disabled: !handlers.canAction("decide_approvals") }]
          : payoutReady
            ? [{ label: "Open payouts", variant: "ghost", onClick: () => handlers.onSetActive("operations") }]
            : [{ label: buyerPaymentPending ? "Open orders" : "Open payouts", variant: "ghost", onClick: () => handlers.onSetActive(buyerPaymentPending ? "market" : "operations") }]
      });
    });

    const filtered = isAgenticMode(handlers) ? items.filter((item) => item.automation !== "auto") : items;
    return filtered.sort((left, right) => {
      const bucketRank = { action: 0, waiting: 1, watch: 2 };
      const bucketDiff = (bucketRank[left.bucket] ?? 9) - (bucketRank[right.bucket] ?? 9);
      if (bucketDiff !== 0) return bucketDiff;
      return idRank(right.id) - idRank(left.id);
    });
  }, [dispatches, handlers, openBuyerDemands, orderAttentionRows, pendingApprovals, pendingSettlements, rankedMatches, settlements]);

  const recentMarketMatches = rankedMatches.slice(0, 4);
  const marketLead = tab === "tracker"
    ? {
        eyebrow: "Market tracker",
        title: marketTrackerItems.length ? "Track demand, orders, dispatch, and payout without losing the thread" : "Market execution is quiet right now",
        summary: "The tracker keeps buyer asks, order approvals, dispatches, payments, and payout release in one joined list.",
        metrics: [
          { label: "Open work", value: number(marketTrackerItems.length), detail: "Across demand, execution, and payout", tone: marketTrackerItems.length ? "high" : "normal" },
          { label: "Needs action", value: number(marketTrackerItems.filter((item) => item.bucket === "action").length), detail: "Can move now", tone: marketTrackerItems.some((item) => item.bucket === "action") ? "high" : "normal" },
          { label: "In motion", value: number(marketTrackerItems.filter((item) => item.bucket === "waiting").length), detail: "Live execution still open", tone: marketTrackerItems.some((item) => item.bucket === "waiting") ? "medium" : "normal" }
        ],
        status: [
          { label: marketTrackerItems[0]?.id ? `Top market item ${marketTrackerItems[0].id}` : "Tracker is clear", tone: marketTrackerItems.length ? "high" : "normal" }
        ]
      }
    : tab === "matching"
    ? {
        eyebrow: "Market execution",
        title: rankedMatches.length ? "Move the strongest buyer matches before they cool off" : "No market matches are ready yet",
        summary: "Demand, match confidence, and execution follow-through are separated so the newest viable deal never disappears into the broader market board.",
        metrics: [
          { label: "Open buyer asks", value: number(openBuyerDemands.length), detail: recentBuyerDemands[0]?.required_date ? `Newest ${compactDateTime(recentBuyerDemands[0].required_date)}` : "No fresh asks", tone: openBuyerDemands.length ? "medium" : "normal" },
          { label: "Strong matches", value: number(rankedMatches.filter((row) => Number(row.match_score || 0) >= 0.8).length), detail: "High-confidence opportunities", tone: rankedMatches.some((row) => Number(row.match_score || 0) >= 0.8) ? "medium" : "normal" },
          { label: "Orders needing follow-through", value: number(orderAttentionRows.length), detail: "Approval or payment still open", tone: orderAttentionRows.length ? "high" : "normal" }
        ],
        status: [
          { label: recentMarketMatches[0]?.buyer_name ? `Best current fit ${recentMarketMatches[0].buyer_name} / ${recentMarketMatches[0].crop}` : "No match selected yet", tone: "neutral" },
          { label: activeDispatchRows.length ? `${number(activeDispatchRows.length)} dispatches are still active` : "No active dispatch risk", tone: activeDispatchRows.length ? "medium" : "normal" }
        ]
      }
    : tab === "demand"
      ? {
          eyebrow: "Buyer demand",
          title: openBuyerDemands.length ? "Keep fresh buyer asks visible until they are matched" : "Buyer demand intake is currently quiet",
          summary: "Fresh buyer asks stay at the top of the lane so demand creation, matching, and follow-up feel like one continuous workflow instead of separate tables.",
          metrics: [
            { label: "Open asks", value: number(openBuyerDemands.length), detail: "Still looking for supply", tone: openBuyerDemands.length ? "medium" : "normal" },
            { label: "Match candidates", value: number(rankedMatches.length), detail: "Available in the matching lane" },
            { label: "Tracked buyers", value: number(buyers.length), detail: "Network on file" }
          ],
          status: [
            { label: recentBuyerDemands[0]?.buyer_name ? `Newest ask from ${recentBuyerDemands[0].buyer_name}` : "No recent buyer ask", tone: "neutral" }
          ]
        }
      : tab === "orders"
        ? {
            eyebrow: "Order follow-through",
            title: orderAttentionRows.length ? "Keep approvals and payments from slipping after the deal is made" : "Sales orders look healthy right now",
            summary: "The queue separates follow-through from order history so the office sees which orders still need action before dispatch or settlement is affected.",
            metrics: [
              { label: "Needs attention", value: number(orderAttentionRows.length), detail: "Approval or payment incomplete", tone: orderAttentionRows.length ? "high" : "normal" },
              { label: "Total sales orders", value: number(salesOrders.length), detail: recentOrderAttention[0]?.created_date ? `Latest ${compactDateTime(recentOrderAttention[0].created_date)}` : "No recent order" },
              { label: "Dispatches in motion", value: number(activeDispatchRows.length), detail: "Still underway", tone: activeDispatchRows.length ? "medium" : "normal" }
            ],
            status: [
              { label: recentOrderAttention[0]?.id ? `Newest follow-up item ${recentOrderAttention[0].id}` : "No follow-up backlog", tone: orderAttentionRows.length ? "high" : "normal" }
            ]
          }
        : tab === "dispatch"
          ? {
              eyebrow: "Dispatch watch",
              title: activeDispatchRows.length ? "Track live dispatches without losing the newest movement" : "Dispatch activity is currently light",
              summary: "Active vehicles and recent shipment movement are separated from the full dispatch ledger so fresh logistics changes stand out immediately.",
              metrics: [
                { label: "Active dispatches", value: number(activeDispatchRows.length), detail: "Not yet delivered", tone: activeDispatchRows.length ? "medium" : "normal" },
                { label: "Total dispatches", value: number(dispatches.length), detail: dispatches[0]?.dispatch_date ? `Latest ${compactDateTime(dispatches[0].dispatch_date)}` : "No dispatch history" },
                { label: "Orders in motion", value: number(orderAttentionRows.length), detail: "Can still affect dispatch" }
              ],
              status: [
                { label: activeDispatchRows[0]?.vehicle_no ? `Latest live vehicle ${activeDispatchRows[0].vehicle_no}` : "No live vehicle movement", tone: "neutral" }
              ]
            }
          : {
              eyebrow: "Market intelligence",
              title: "Keep pricing context close to buyer action",
              summary: "Price signals and buyer network details stay nearby so operators can create demand and deals with market context still in view.",
              metrics: [
                { label: "Price rows", value: number(prices.length), detail: "Mandi reference feed" },
                { label: "Buyers", value: number(buyers.length), detail: "Connected network" },
                { label: "Open asks", value: number(openBuyerDemands.length), detail: "Demand still active" }
              ],
              status: [
                { label: prices[0]?.date ? `Latest price signal ${compactDateTime(prices[0].date)}` : "No price refresh yet", tone: "neutral" }
              ]
            };

  return (
    <div className="stack">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      <div className="section-sticky-head glass-light">
        <SubTabNav tabs={tabs} active={tab} onChange={setTab} />
        <div className="section-sticky-actions">
          <button type="button" className="btn-ghost btn-small" onClick={() => setPaletteOpen(true)} title="Ctrl+K">Ctrl+K</button>
          <button type="button" className="btn-primary btn-small" onClick={() => setDrawer("buyer")} disabled={!handlers.canAction("create_buyer_demand")}>Add Buyer Demand</button>
        </div>
      </div>

      <SectionLead
        eyebrow={marketLead.eyebrow}
        title={marketLead.title}
        summary={marketLead.summary}
        metrics={marketLead.metrics}
        status={marketLead.status}
        actions={
          <>
            <button type="button" className="btn-primary" onClick={() => setDrawer("buyer")} disabled={!handlers.canAction("create_buyer_demand")}>Add Buyer Demand</button>
            <button type="button" className="btn-ghost" onClick={() => setPaletteOpen(true)}>Commands</button>
          </>
        }
        note="Fresh demand, strongest matches, and downstream follow-through stay separated so new line items are visible before they blend into history."
      />
      {tab === "tracker" ? (
        <div className="stack">
          {isAgenticMode(handlers) ? (
            <AgentActivityRail
              agentActivity={agentActivity}
              onRunCycle={handleRunAgentCycle}
              onResetDemo={handlers.onResetDemo}
              canRun={handlers.canAction && handlers.canAction("run_demo")}
              canReset={handlers.canAction && handlers.canAction("reseed")}
              busy={agentBusy}
            />
          ) : null}
          <TrackerWorkspace
            title={isAgenticMode(handlers) ? "Escalations only — items agents cannot finish" : "Market work tracker"}
            helper={isAgenticMode(handlers) ? "Everything here hit a policy gate or a low-confidence signal. Resolve it to hand the work back to the agents." : "Track any buyer demand, sales order, dispatch, or linked payout from one place."}
            items={marketTrackerItems}
            search={trackerQuery}
            onSearchChange={setTrackerQuery}
            activeId={trackerActiveId}
            onActiveIdChange={setTrackerActiveId}
            emptyTitle={isAgenticMode(handlers) ? "All agents are unblocked — no market escalations pending." : "No active market items match the current search."}
          />
        </div>
      ) : null}

      {tab !== "tracker" ? <div className="workboard-grid">
        <WorkboardCard eyebrow="Fresh demand" title="Buyer asks to work first" subtitle="New or still-open buyer asks stay visible before the broader demand board." count={openBuyerDemands.length} tone={openBuyerDemands.length ? "medium" : "normal"}>
          <div className="workboard-list">
            {recentBuyerDemands.length ? recentBuyerDemands.map((row) => (
              <WorkboardItem
                key={row.id}
                title={joinParts([row.buyer_name, row.crop])}
                meta={joinParts([`${number(row.quantity_mt || 0)} MT`, currency(row.offered_price)])}
                detail={joinParts([row.required_date ? `Needed ${compactDateTime(row.required_date)}` : "", row.delivery_location])}
                chips={[<QueueFreshTag key="fresh" />, <SeverityBadge key="status" value={row.status} />]}
              />
            )) : <div className="queue-empty">No open buyer asks right now.</div>}
          </div>
        </WorkboardCard>

        <WorkboardCard eyebrow="Best match" title="Highest-confidence deals ready to move" subtitle="The strongest current fits are surfaced before the full ranked list." count={rankedMatches.length} tone={rankedMatches.some((row) => Number(row.match_score || 0) >= 0.8) ? "medium" : "normal"}>
          <div className="workboard-list">
            {recentMarketMatches.length ? recentMarketMatches.map((row) => (
              <WorkboardItem
                key={`${row.buyer_demand_id}-${row.fpo_name}`}
                title={joinParts([row.crop, row.buyer_name])}
                meta={joinParts([row.fpo_name, `${Math.round(Number(row.match_score || 0) * 100)}% score`])}
                detail={joinParts([`Need ${number(row.required_mt || 0)} MT`, `Available ${number(row.available_mt || 0)} MT`, currency(row.offered_price)])}
                chips={[<QueueFreshTag key="fresh" />]}
                action={<button type="button" className="btn-ghost btn-small" disabled={!handlers.canAction("create_sales_order")} onClick={() => acceptMatch(row)}>Create order</button>}
              />
            )) : <div className="queue-empty">No match candidates are available yet.</div>}
          </div>
        </WorkboardCard>

        <WorkboardCard eyebrow="Follow-through" title="Orders and dispatches still in motion" subtitle="Post-match activity stays visible so execution does not get lost after the deal is made." count={orderAttentionRows.length + activeDispatchRows.length} tone={orderAttentionRows.length ? "high" : activeDispatchRows.length ? "medium" : "normal"}>
          <div className="workboard-list">
            {recentOrderAttention.length ? recentOrderAttention.map((row) => (
              <WorkboardItem
                key={row.id}
                title={joinParts([row.id, row.buyer_name])}
                meta={joinParts([row.crop, `${number(row.quantity_mt || 0)} MT`, currency(row.price)])}
                detail={joinParts([approvalSummaryLabel(row.approval_status), row.payment_status !== "received" ? "Payment pending" : "Payment received"])}
                chips={[
                  row.created_by_agent ? <span className="badge badge-info" key="agent">Agent</span> : <QueueFreshTag key="fresh" />,
                  <SeverityBadge key="approval" value={row.approval_status} />,
                  <SeverityBadge key="payment" value={row.payment_status} />
                ]}
              />
            )) : activeDispatchRows.length ? activeDispatchRows.map((row) => (
              <WorkboardItem
                key={row.id}
                title={joinParts([row.id, row.sales_order_id])}
                meta={joinParts([`${number(row.qty_dispatched_mt || 0)} MT`, row.vehicle_no])}
                detail={joinParts([row.dispatch_date ? compactDateTime(row.dispatch_date) : "", titleCase(row.delivery_status)])}
                chips={[<QueueFreshTag key="fresh" />, <SeverityBadge key="status" value={row.delivery_status} />]}
              />
            )) : <div className="queue-empty">No follow-through queue is open right now.</div>}
          </div>
        </WorkboardCard>
      </div> : null}

      {tab === "matching" ? (
        <div className="stack">
          <div className="match-filter-bar">
            <label className="inline-field">
              <span>Crop</span>
              <select value={matchCropFilter} onChange={(e) => setMatchCropFilter(e.target.value)}>
                <option value="">All</option>
                {cropOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="inline-field">
              <span>Min score {matchMinScore}%</span>
              <input type="range" min="0" max="100" step="5" value={matchMinScore} onChange={(e) => setMatchMinScore(Number(e.target.value))} />
            </label>
            <span className="match-filter-summary">Showing {filteredMatches.length} of {rankedMatches.length}</span>
            <SavedViewsBar
              scope="market_matching"
              currentFilters={{ crop: matchCropFilter, minScore: matchMinScore }}
              onApply={(v) => { setMatchCropFilter(v.crop || ""); setMatchMinScore(v.minScore || 0); }}
            />
          </div>
          <div className="market-split">
            <div className="market-split-list glass-normal">
              <div className="market-split-head">
                <div>
                  <strong>Choose a match</strong>
                  <span className="selection-pane-note">Highlight a row to inspect the same deal on the right.</span>
                </div>
                <div className="market-split-head-side">
                  {selectedMatch ? <span className="selection-active-pill">{selectedMatch.buyer_demand_id}</span> : null}
                  <span className="hint">j/k to navigate</span>
                </div>
              </div>
              <ul className="market-match-list">
                {filteredMatches.length ? filteredMatches.map((row) => {
                  const key = `${row.buyer_demand_id}-${row.fpo_name}`;
                  const pct = Math.round(Number(row.match_score || 0) * 100);
                  const active = selectedMatch && `${selectedMatch.buyer_demand_id}-${selectedMatch.fpo_name}` === key;
                  return (
                    <li key={key}>
                      <button type="button" className={`market-match-row ${active ? "active" : ""}`} onClick={() => setSelectedMatchKey(key)}>
                        <div className="match-row-top">
                          <strong>{row.crop}</strong>
                          <span className={`badge badge-${pct >= 80 ? "normal" : pct >= 60 ? "medium" : "high"}`}>{pct}%</span>
                        </div>
                        <div className="match-row-mid">{row.buyer_name} · {row.fpo_name}</div>
                        <div className="match-row-bot">{number(row.required_mt || 0)} MT needed · {currency(row.offered_price)}</div>
                      </button>
                    </li>
                  );
                }) : <li className="queue-empty">No matches for current filters.</li>}
              </ul>
            </div>
            <div className="market-split-detail glass-normal">
              <div className="selection-pane-head selection-pane-head-detail">
                <div>
                  <strong>Selected match</strong>
                  <span className="selection-pane-note">This panel mirrors the highlighted match on the left.</span>
                </div>
                {selectedMatch ? <span className="selection-active-pill">{selectedMatch.buyer_demand_id}</span> : null}
              </div>
              {selectedMatch ? (
                <div className="match-detail">
                  <div className="match-detail-head">
                    <div>
                      <h3>{selectedMatch.crop} · {selectedMatch.buyer_name}</h3>
                      <p className="match-detail-sub">{selectedMatch.fpo_name} · Demand {selectedMatch.buyer_demand_id}</p>
                    </div>
                    <MatchScoreCell value={selectedMatch.match_score} />
                  </div>
                  <div className="match-detail-grid">
                    <div><span className="hint">Required</span><strong>{number(selectedMatch.required_mt || 0)} MT</strong></div>
                    <div><span className="hint">Available</span><strong>{number(selectedMatch.available_mt || 0)} MT</strong></div>
                    <div><span className="hint">Buyer offer</span><strong>{currency(selectedMatch.offered_price)}</strong></div>
                    <div><span className="hint">Coverage</span><strong>{Math.round(Math.min(1, (selectedMatch.available_mt || 0) / (selectedMatch.required_mt || 1)) * 100)}%</strong></div>
                  </div>
                  <MatchScoreInfoLabel />
                  <div className="match-detail-actions">
                    <button type="button" className="btn-primary" disabled={!handlers.canAction("create_sales_order")} onClick={() => acceptMatch(selectedMatch)}>Accept match → Sales order</button>
                  </div>
                </div>
              ) : <div className="queue-empty">No match selected.</div>}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "demand" ? (
        <TableCard title="Buyer Demand Board">
          <DataTable
            enableSearch
            enableFilters
            columns={[
              { key: "id", label: "Demand ID" },
              { key: "buyer_name", label: "Buyer" },
              { key: "crop", label: "Crop" },
              { key: "quantity_mt", label: "Qty (MT)" },
              { key: "offered_price", label: "Offer", render: (v) => currency(v) },
              { key: "required_date", label: "Age", render: (v) => <AgeBadge date={v} /> },
              { key: "status", label: "Status", render: (v) => <SeverityBadge value={v} /> }
            ]}
            rows={buyerDemands}
          />
        </TableCard>
      ) : null}

      {tab === "orders" ? (
        <div className="stack">
          <TableCard title={`Sales Orders needing attention — ${orderAttentionRows.length}`}>
            <SelectableTable
              columns={[
                { key: "id", label: "Order" },
                { key: "buyer_name", label: "Buyer" },
                { key: "crop", label: "Crop" },
                { key: "quantity_mt", label: "Qty (MT)" },
                { key: "price", label: "Price", render: (v) => currency(v) },
                { key: "created_date", label: "Age", render: (v) => <AgeBadge date={v} /> },
                { key: "approval_status", label: "Approval", render: (v) => <SeverityBadge value={v} /> },
                { key: "payment_status", label: "Payment", render: (v) => <SeverityBadge value={v} /> },
                {
                  key: "id",
                  label: "Action",
                  render: (_v, row) =>
                    canMarkSalesOrderPaid(row, dispatches) ? (
                      <InlineConfirmAction label="Mark Paid" disabled={!handlers.canAction("mark_sales_paid")} onConfirm={() => handlers.onMarkSalesOrderPaid(row.id)} />
                    ) : isApprovalPending(row.approval_status) ? (
                      "Await approval"
                    ) : isApprovalCleared(row.approval_status) && !hasDispatchForSalesOrder(row.id, dispatches) ? (
                      "Dispatch first"
                    ) : "Paid"
                }
              ]}
              rows={orderAttentionRows}
            />
          </TableCard>
          <TableCard title="All Sales Orders" collapsible>
            <DataTable
              columns={[
                { key: "id", label: "Order ID" },
                { key: "buyer_name", label: "Buyer" },
                { key: "crop", label: "Crop" },
                { key: "quantity_mt", label: "Qty (MT)" },
                { key: "price", label: "Price", render: (v) => currency(v) },
                { key: "payment_status", label: "Payment", render: (v) => <SeverityBadge value={v} /> }
              ]}
              rows={salesOrders}
            />
          </TableCard>
        </div>
      ) : null}

      {tab === "dispatch" ? (
        <div className="stack">
          <div className="section-toolbar">
            <div />
            <button type="button" className="btn-primary" disabled={!handlers.canAction("create_dispatch")} onClick={() => setDrawer("dispatch")}>Create Dispatch</button>
          </div>
          <TableCard title="Dispatches">
            <DataTable
              enableSearch
              enableFilters
              columns={[
                { key: "id", label: "Dispatch" },
                { key: "sales_order_id", label: "Sales Order" },
                { key: "vehicle_no", label: "Vehicle" },
                { key: "qty_dispatched_mt", label: "Qty (MT)" },
                { key: "dispatch_date", label: "Age", render: (v) => <AgeBadge date={v} /> },
                { key: "delivery_status", label: "Delivery", render: (v) => <SeverityBadge value={v} /> }
              ]}
              rows={dispatches}
            />
          </TableCard>
        </div>
      ) : null}

      {tab === "prices" ? (
        <div className="equal-grid">
          <TableCard title="Mandi Price Feed">
            <DataTable columns={[{ key: "crop", label: "Crop" }, { key: "mandi", label: "Market" }, { key: "price_min", label: "Min", render: (v) => currency(v) }, { key: "price_avg", label: "Avg", render: (v) => currency(v) }, { key: "price_max", label: "Max", render: (v) => currency(v) }, { key: "date", label: "Date" }]} rows={prices} />
          </TableCard>
          <TableCard title="Buyer Network">
            <DataTable columns={[{ key: "name", label: "Buyer" }, { key: "buyer_type", label: "Type" }, { key: "district", label: "District" }, { key: "reliability_score", label: "Reliability" }]} rows={buyers} />
          </TableCard>
        </div>
      ) : null}

      <Drawer open={drawer === "buyer"} title="Add Buyer Demand" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateBuyerDemand({ ...buyerDemandForm, quantity_mt: Number(buyerDemandForm.quantity_mt), offered_price: Number(buyerDemandForm.offered_price) }), () => setDrawer("")); }}><label><span>Buyer</span><select value={buyerDemandForm.buyer_id} onChange={(event) => setBuyerDemandForm({ ...buyerDemandForm, buyer_id: event.target.value })}>{buyers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Crop</span><input value={buyerDemandForm.crop} onChange={(event) => setBuyerDemandForm({ ...buyerDemandForm, crop: event.target.value })} /></label><label><span>Quantity (MT)</span><input type="number" value={buyerDemandForm.quantity_mt} onChange={(event) => setBuyerDemandForm({ ...buyerDemandForm, quantity_mt: event.target.value })} /></label><label><span>Offered price</span><input type="number" value={buyerDemandForm.offered_price} onChange={(event) => setBuyerDemandForm({ ...buyerDemandForm, offered_price: event.target.value })} /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Create demand</button></div></form></Drawer>
      <Drawer open={drawer === "sales"} title="Create Sales Order" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateSalesOrder({ ...salesOrderForm, quantity_mt: Number(salesOrderForm.quantity_mt), price: Number(salesOrderForm.price), collection_ids: salesOrderForm.collection_ids }), () => setDrawer("")); }}><label><span>Buyer</span><select value={salesOrderForm.buyer_id} onChange={(event) => setSalesOrderForm({ ...salesOrderForm, buyer_id: event.target.value })}>{buyers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label><span>Crop</span><input value={salesOrderForm.crop} onChange={(event) => setSalesOrderForm({ ...salesOrderForm, crop: event.target.value })} /></label><label><span>Quantity (MT)</span><input type="number" value={salesOrderForm.quantity_mt} onChange={(event) => setSalesOrderForm({ ...salesOrderForm, quantity_mt: event.target.value })} /></label><label><span>Price</span><input type="number" value={salesOrderForm.price} onChange={(event) => setSalesOrderForm({ ...salesOrderForm, price: event.target.value })} /></label><label><span>Demand link</span><select value={salesOrderForm.buyer_demand_id} onChange={(event) => setSalesOrderForm({ ...salesOrderForm, buyer_demand_id: event.target.value })}><option value="">None</option>{buyerDemands.map((row) => <option key={row.id} value={row.id}>{row.id} - {row.buyer_name}</option>)}</select></label><label><span>Eligible collections</span><input value={number(collections.filter((row) => row.crop === salesOrderForm.crop).length)} readOnly /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Create sales order</button></div></form></Drawer>
      <Drawer open={drawer === "dispatch"} title="Create Dispatch" onClose={() => setDrawer("")}><form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateDispatch({ ...dispatchForm, qty_dispatched_mt: Number(dispatchForm.qty_dispatched_mt) }), () => setDrawer("")); }}><label><span>Sales order</span><select value={dispatchForm.sales_order_id} onChange={(event) => setDispatchForm({ ...dispatchForm, sales_order_id: event.target.value })}>{salesOrders.map((row) => <option key={row.id} value={row.id}>{row.id} - {row.buyer_name}</option>)}</select></label><label><span>Qty dispatched (MT)</span><input type="number" value={dispatchForm.qty_dispatched_mt} onChange={(event) => setDispatchForm({ ...dispatchForm, qty_dispatched_mt: event.target.value })} /></label><label><span>Vehicle no</span><input value={dispatchForm.vehicle_no} onChange={(event) => setDispatchForm({ ...dispatchForm, vehicle_no: event.target.value })} /></label><div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawer("")}>Cancel</button><button type="submit" className="btn-primary">Create dispatch</button></div></form></Drawer>
    </div>
  );
}

function CommunicationSection({ sectionData, handlers }) {
  const inboxAll = sliceRows(sectionData.inbox);
  const broadcasts = sliceRows(sectionData.broadcasts);
  const agentConfig = sectionData.agentConfig || {};
  const lookups = sectionData.lookups || {};
  const farmers = lookups.farmers || [];
  const fpos = lookups.fpos || [];
  const villages = lookups.villages || [];
  const crops = lookups.crops || [];
  const languages = lookups.languages || [];

  const [activeTab, setActiveTab] = useState("all");
  const [selectedMessageId, setSelectedMessageId] = useState("");
  const [threadRows, setThreadRows] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ text: "", fpo_id: "", village: "", crop: "", language: "" });
  const [expandedBroadcastId, setExpandedBroadcastId] = useState("");
  const [broadcastRecipients, setBroadcastRecipients] = useState({});

  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  useEffect(() => { setTypeFilter("all"); }, [activeTab]);
  const inboxTab = activeTab === "escalations" ? inboxAll.filter((row) => row.escalated) : inboxAll;
  const typeKey = activeTab === "escalations" ? "escalation_category" : "intent";
  const categoryOptions = Array.from(new Set(inboxTab.map((r) => r[typeKey]).filter((c) => c && c !== "none")));
  const inbox = inboxTab
    .filter((r) => typeFilter === "all" || r[typeKey] === typeFilter)
    .slice()
    .sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
  const selectedMessage = inbox.find((row) => row.id === selectedMessageId) || inbox[0];
  const pendingMessages = inbox.filter((row) => row.status === "pending");
  const inProgressMessages = inbox.filter((row) => row.status === "in_progress");
  const resolvedMessages = inbox.filter((row) => row.status === "resolved");

  const previewRecipients = farmers.filter((f) => {
    if (broadcastForm.fpo_id && f.fpo_id !== broadcastForm.fpo_id) return false;
    if (broadcastForm.village && f.village !== broadcastForm.village) return false;
    if (broadcastForm.crop && f.primary_crop !== broadcastForm.crop) return false;
    if (broadcastForm.language && f.language !== broadcastForm.language) return false;
    if (!f.whatsapp_opt_in) return false;
    return true;
  }).length;
  const totalReach = broadcasts.reduce((sum, b) => sum + (b.read_count || 0), 0);

  useEffect(() => {
    if (!selectedMessageId && inbox[0]?.id) setSelectedMessageId(inbox[0].id);
  }, [inbox, selectedMessageId]);

  useEffect(() => {
    let mounted = true;
    async function loadThread() {
      if (!selectedMessage?.farmer_id) return;
      const payload = await api.communicationThread(selectedMessage.farmer_id, 40);
      if (mounted) setThreadRows(sliceRows(payload).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    }
    loadThread();
    return () => { mounted = false; };
  }, [sectionData.inbox?.total, selectedMessage?.farmer_id]);

  function statusLabel(s) {
    if (s === "pending") return "New";
    if (s === "in_progress") return "In Progress";
    return "Resolved";
  }
  function statusClass(s) {
    if (s === "pending") return "badge-warn";
    if (s === "in_progress") return "badge-info";
    return "badge-ok";
  }
  function laneClass(s) {
    if (s === "pending") return "jira-lane-warn";
    if (s === "in_progress") return "jira-lane-info";
    return "jira-lane-ok";
  }
  function actionLabelForStatus(s) {
    if (s === "pending") return "Start";
    if (s === "in_progress") return "Resolve";
    return "Reopen";
  }
  function nextStatusForMessage(s) {
    if (s === "pending") return "in_progress";
    if (s === "in_progress") return "resolved";
    return "in_progress";
  }
  async function openMessage(message) {
    if (!message) return;
    setSelectedMessageId(message.id);
    if (handlers.canAction("communicate") && message.status === "pending") {
      await handlers.onSetMessageStatus(message.id, "in_progress");
    }
  }
  async function moveMessage(message, nextStatus) {
    if (!handlers.canAction("communicate") || !message || message.status === nextStatus) return;
    setSelectedMessageId(message.id);
    await handlers.onSetMessageStatus(message.id, nextStatus);
  }

  const boardColumns = [
    { id: "pending", title: "New", subtitle: "Fresh incoming threads", rows: pendingMessages },
    { id: "in_progress", title: "In Progress", subtitle: "Being handled by the team", rows: inProgressMessages },
    { id: "resolved", title: "Resolved", subtitle: "Closed conversations", rows: resolvedMessages }
  ];

  const timeline = selectedMessage
    ? [
        { label: "Created", value: selectedMessage.timestamp },
        { label: "Opened", value: selectedMessage.in_progress_at || null },
        { label: "Replied", value: selectedMessage.resolved_at || null }
      ]
    : [];
  const selectedMessageHasAgentReply = selectedMessage
    ? threadRows.some((row) => row.direction === "outgoing" && row.message_id === selectedMessage.id && row.agent_generated)
    : false;
  const selectedMessageCanUseAgentReply = handlers.canAction("communicate") && selectedMessage && !agentConfig.agent_auto_reply_enabled && !selectedMessageHasAgentReply;

  async function toggleBroadcast(id) {
    if (expandedBroadcastId === id) { setExpandedBroadcastId(""); return; }
    setExpandedBroadcastId(id);
    if (!broadcastRecipients[id]) {
      const payload = await api.broadcastRecipients(id);
      setBroadcastRecipients((prev) => ({ ...prev, [id]: sliceRows(payload) }));
    }
  }

const escalationOpenCount = inboxAll.filter((row) => row.escalated && row.status !== "resolved").length;

  return (
    <div className="stack">
      <div className="section-toolbar">
        <div className="stat-grid">
          <StatCard label="Messages" value={number(sectionData.inbox?.total)} />
          <StatCard label="Escalations Open" value={number(escalationOpenCount)} tone="high" />
          <StatCard label="Broadcasts" value={number(broadcasts.length)} />
          <StatCard label="Read Confirmations" value={number(totalReach)} />
        </div>
        <button type="button" className="btn-primary" onClick={() => setDrawerOpen(true)} disabled={!handlers.canAction("communicate")}>New Advisory Broadcast</button>
      </div>

      <div className="pill-tabs">
        <button type="button" className={`pill-tab ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>All Messages</button>
        <button type="button" className={`pill-tab ${activeTab === "escalations" ? "active" : ""}`} onClick={() => setActiveTab("escalations")}>Escalations</button>
        <button type="button" className={`pill-tab ${activeTab === "broadcasts" ? "active" : ""}`} onClick={() => setActiveTab("broadcasts")}>Broadcasts</button>
      </div>
      <AgentModeNotice agentConfig={agentConfig} />

      {activeTab === "broadcasts" ? (
        <div className="broadcast-grid">
          {!broadcasts.length ? <p className="jira-lane-empty">No broadcasts yet.</p> : null}
          {broadcasts.map((b) => {
            const total = b.recipient_count || 0;
            const read = b.read_count || 0;
            const pct = total ? Math.round((read / total) * 100) : 0;
            const expanded = expandedBroadcastId === b.id;
            const recipients = broadcastRecipients[b.id] || [];
            return (
              <div key={b.id} className="table-card glass-normal">
                <div className="jira-board-head">
                  <div>
                    <h4>{b.id}</h4>
                    <p className="jira-ticket-submeta">{formatDateTime(b.created_at)}</p>
                  </div>
                  <span className="badge badge-info">{b.language}</span>
                </div>
                <p style={{ margin: "8px 0" }}>{b.text}</p>
                <div className="jira-ticket-submeta">Audience: FPO {b.fpo_id} / Village {b.village} / Crop {b.crop}</div>
                <div className="broadcast-metrics" style={{ display: "flex", gap: 16, margin: "12px 0" }}>
                  <div><strong>{total}</strong><div className="jira-ticket-submeta">Sent</div></div>
                  <div><strong>{read}</strong><div className="jira-ticket-submeta">Read</div></div>
                  <div><strong>{pct}%</strong><div className="jira-ticket-submeta">Read rate</div></div>
                </div>
                <div style={{ background: "#eee", height: 6, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "#4caf50" }} />
                </div>
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="btn-ghost btn-small" onClick={() => toggleBroadcast(b.id)}>
                    {expanded ? "Hide recipients" : "View recipients"}
                  </button>
                </div>
                {expanded ? (
                  <div style={{ marginTop: 12 }}>
                    <DataTable
                      columns={[
                        { key: "farmer_name", label: "Farmer" },
                        { key: "village", label: "Village" },
                        { key: "status", label: "Status", render: (v) => <span className={`badge ${v === "read" ? "badge-ok" : "badge-warn"}`}>{v}</span> },
                        { key: "read_at", label: "Read at", render: (v) => v ? formatDateTime(v) : "-" }
                      ]}
                      rows={recipients}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
      <div className="table-card glass-normal communication-jira-shell">
        <div className="jira-board-layout">
          <div className="jira-board-panel">
            <div className="jira-board-head">
              <h3>{activeTab === "escalations" ? "Escalations Board" : "Communication Board"}</h3>
              <AgentStatusBadge agentConfig={agentConfig} />
            </div>
            <div className="table-controls">
              <div className="table-filter-grid">
                <label className="table-control">
                  <span>Filter {activeTab === "escalations" ? "Type" : "Intent"}</span>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                    <option value="all">All</option>
                    {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="table-control">
                  <span>Sort By Date</span>
                  <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
              </div>
              <div className="table-controls-summary">
                <span>Showing {inbox.length} of {inboxTab.length}</span>
              </div>
            </div>

            <div className="jira-board-grid">
              {boardColumns.map((column) => (
                <section key={column.id} className={`jira-lane ${laneClass(column.id)}`}>
                  <div className="jira-lane-head">
                    <div>
                      <h4>{column.title}</h4>
                      <p>{column.subtitle}</p>
                    </div>
                    <span className="jira-lane-count">{column.rows.length}</span>
                  </div>

                  <div className="jira-lane-list">
                    {!column.rows.length ? <p className="jira-lane-empty">No threads in this lane.</p> : null}
                    {column.rows.map((row) => (
                      <button key={row.id} type="button" className={`jira-card ${selectedMessageId === row.id ? "active" : ""}`} onClick={() => openMessage(row)}>
                        <div className="jira-card-top">
                          <span className="jira-ticket-key">{row.id.slice(-6).toUpperCase()}</span>
                          <span className={`badge ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
                        </div>
                        <div className="jira-card-body">
                          <strong className="jira-ticket-summary">{row.text || "No message"}</strong>
                          <span className="jira-ticket-meta">{row.farmer_name}</span>
                          <span className="jira-ticket-submeta">{formatDateTime(row.timestamp)}</span>
                        </div>
                        <div className="jira-card-bottom">
                          <IntentChip value={row.intent} />
                          <button
                            type="button"
                            className="btn-ghost btn-small jira-card-action"
                            disabled={!handlers.canAction("communicate")}
                            onClick={(event) => {
                              event.stopPropagation();
                              moveMessage(row, nextStatusForMessage(row.status));
                            }}
                          >
                            {actionLabelForStatus(row.status)}
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="jira-detail-panel">
            {selectedMessage ? (
              <>
                <div className="jira-detail-head">
                  <div>
                    <h4>{selectedMessage.farmer_name}</h4>
                    <span className="jira-detail-id">{selectedMessage.id}</span>
                  </div>
                  <div className="jira-detail-head-tags">
                    <IntentChip value={selectedMessage.intent} />
                    <span className={`badge ${statusClass(selectedMessage.status)}`}>{statusLabel(selectedMessage.status)}</span>
                  </div>
                </div>

                <div className="jira-detail-body">
                  <div className="jira-detail-summary-card">
                    <div className="jira-detail-summary-row">
                      <span className="jira-detail-field">Reporter</span>
                      <strong>{selectedMessage.farmer_name}</strong>
                    </div>
                    <div className="jira-detail-summary-row jira-detail-summary-text">
                      <span className="jira-detail-field">Latest message</span>
                      <p>{selectedMessage.text || "No message provided."}</p>
                    </div>
                  </div>

                  <div className="jira-timeline">
                    {timeline.map((item) => (
                      <div key={item.label} className={`jira-timeline-item ${item.value ? "is-complete" : ""}`}>
                        <span className="jira-timeline-dot" />
                        <div>
                          <strong>{item.label}</strong>
                          <p>{item.value ? formatDateTime(item.value) : "Pending"}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="jira-thread">
                    {threadRows.map((row) => (
                      <div key={row.id} className={`jira-msg ${row.direction === "incoming" ? "incoming" : "outgoing"}`}>
                        <span className="jira-msg-author">{row.direction === "incoming" ? selectedMessage.farmer_name : "FPO Office"}</span>
                        <p className="jira-msg-text">{row.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <form className="jira-reply" onSubmit={(event) => { event.preventDefault(); if (selectedMessage && replyText.trim()) submitAndMaybeClose(handlers.onOfficeReply({ farmer_id: selectedMessage.farmer_id, text: replyText, message_id: selectedMessage.id }), () => setReplyText("")); }}>
                  <textarea rows={3} value={replyText} onChange={(event) => setReplyText(event.target.value)} placeholder="Reply to selected thread" />
                  <div className="jira-reply-actions">
                    <button type="submit" className="btn-primary" disabled={!handlers.canAction("communicate") || !replyText.trim()}>Send reply</button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={!selectedMessageCanUseAgentReply}
                      title={agentConfig.agent_auto_reply_enabled ? "Agentic Work already auto-handles farmer messages." : selectedMessageHasAgentReply ? "This thread already has an agent-generated reply." : "Send an agent-assisted reply."}
                      onClick={() => handlers.onAgentReply(selectedMessage.id)}
                    >
                      {agentConfig.agent_auto_reply_enabled ? "Auto Handled" : "Agent Reply"}
                    </button>
                    {selectedMessage.status !== "in_progress" ? (
                      <button type="button" className="btn-ghost" disabled={!handlers.canAction("communicate")} onClick={() => moveMessage(selectedMessage, "in_progress")}>Mark In Progress</button>
                    ) : null}
                    {selectedMessage.status !== "resolved" ? (
                      <button type="button" className="btn-ghost" disabled={!handlers.canAction("communicate")} onClick={() => moveMessage(selectedMessage, "resolved")}>Resolve</button>
                    ) : (
                      <button type="button" className="btn-ghost" disabled={!handlers.canAction("communicate")} onClick={() => moveMessage(selectedMessage, "in_progress")}>Reopen</button>
                    )}
                  </div>
                </form>
              </>
            ) : (
              <div className="jira-detail-empty">
                <p>Select a thread to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      )}

      <Drawer open={drawerOpen} title="Broadcast Composer" subtitle={`Audience preview: ${previewRecipients} farmers`} onClose={() => setDrawerOpen(false)}>
        <form className="drawer-form" onSubmit={(event) => {
          event.preventDefault();
          submitAndMaybeClose(
            handlers.onCreateBroadcast(broadcastForm),
            () => { setBroadcastForm({ text: "", fpo_id: "", village: "", crop: "", language: "" }); setDrawerOpen(false); }
          );
        }}>
          <label className="field-span-full"><span>Message</span>
            <textarea rows={4} value={broadcastForm.text} onChange={(e) => setBroadcastForm({ ...broadcastForm, text: e.target.value })} required />
          </label>
          <label><span>FPO</span>
            <select value={broadcastForm.fpo_id} onChange={(e) => setBroadcastForm({ ...broadcastForm, fpo_id: e.target.value })}>
              <option value="">All FPOs</option>
              {fpos.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label><span>Village</span>
            <select value={broadcastForm.village} onChange={(e) => setBroadcastForm({ ...broadcastForm, village: e.target.value })}>
              <option value="">All villages</option>
              {villages.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label><span>Crop</span>
            <select value={broadcastForm.crop} onChange={(e) => setBroadcastForm({ ...broadcastForm, crop: e.target.value })}>
              <option value="">All crops</option>
              {crops.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label><span>Language</span>
            <select value={broadcastForm.language} onChange={(e) => setBroadcastForm({ ...broadcastForm, language: e.target.value })}>
              <option value="">All languages</option>
              {languages.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <div className="field-span-full jira-ticket-submeta">Recipients will be asked to reply YES to confirm they have read the advisory.</div>
          <div className="drawer-button-stack">
            <button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!previewRecipients}>Send broadcast ({previewRecipients})</button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}

function CarbonSection({ sectionData, handlers }) {
  const practices = sliceRows(sectionData.practices);
  const estimates = sliceRows(sectionData.estimates);
  const projects = sliceRows(sectionData.projects);
  const lookups = sectionData.lookups || {};
  const credits = projects.reduce((sum, row) => sum + Number(row.estimated_credits || 0), 0);
  const revenue = projects.reduce((sum, row) => sum + Number(row.estimated_revenue_usd || 0), 0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ farmer_id: lookups.farmers?.[0]?.id || "", practice_type: "Drip Irrigation", area_ha: "1.2", crop: "Onion" });

  useEffect(() => {
    if (!form.farmer_id && lookups.farmers?.[0]?.id) setForm((current) => ({ ...current, farmer_id: lookups.farmers[0].id }));
  }, [form.farmer_id, lookups.farmers]);

  return (
    <div className="stack">
      <div className="section-toolbar">
        <div className="stat-grid">
          <StatCard label="Practice Logs" value={number(sectionData.practices?.total)} />
          <StatCard label="Carbon Estimates" value={number(sectionData.estimates?.total)} />
          <StatCard label="Carbon Projects" value={number(sectionData.projects?.total)} />
          <StatCard label="Total Credits Est." value={number(credits, 2)} tone="medium" />
          <StatCard label="Revenue Est." value={currency(revenue)} />
        </div>
        <button type="button" className="btn-primary" onClick={() => setDrawerOpen(true)} disabled={!handlers.canAction("manage_carbon")}>Log Practice</button>
      </div>

      <div className="equal-grid">
        <TableCard title="Practice Tracking">
          <DataTable
            columns={[
              { key: "farmer_id", label: "Farmer ID" },
              { key: "crop", label: "Crop" },
              { key: "practice_type", label: "Practice" },
              { key: "area_ha", label: "Area (ha)", render: (value) => number(value, 2) },
              { key: "start_date", label: "Date" }
            ]}
            rows={practices}
          />
        </TableCard>
        <TableCard title="Carbon Estimates">
          <DataTable
            columns={[
              { key: "practice_id", label: "Practice" },
              { key: "farmer_id", label: "Farmer" },
              { key: "practice_type", label: "Practice Type" },
              { key: "area_ha", label: "Area (ha)", render: (value) => number(value, 2) },
              { key: "estimated_credits", label: "Credits Est.", render: (value) => number(value, 3) }
            ]}
            rows={estimates}
          />
        </TableCard>
      </div>

      <TableCard title="Project Aggregation">
        <DataTable
          columns={[
            { key: "id", label: "Project" },
            { key: "fpo_name", label: "FPO" },
            { key: "crop", label: "Crop" },
            { key: "farmer_count", label: "Farmers" },
            { key: "total_area_ha", label: "Area (ha)", render: (value) => number(value, 2) },
            { key: "estimated_credits", label: "Credits", render: (value) => number(value, 2) },
            { key: "estimated_revenue_usd", label: "Revenue", render: (value) => currency(value) },
            { key: "verification_readiness_pct", label: "Readiness", render: (value) => `${number(value, 1)}%` }
          ]}
          rows={projects}
        />
      </TableCard>

      <Drawer open={drawerOpen} title="Log Carbon Practice" onClose={() => setDrawerOpen(false)}>
        <form className="drawer-form" onSubmit={(event) => { event.preventDefault(); submitAndMaybeClose(handlers.onCreateCarbonPractice({ ...form, area_ha: Number(form.area_ha) }), () => setDrawerOpen(false)); }}>
          <label><span>Farmer</span><select value={form.farmer_id} onChange={(event) => setForm({ ...form, farmer_id: event.target.value })}>{(lookups.farmers || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label><span>Crop</span><input value={form.crop} onChange={(event) => setForm({ ...form, crop: event.target.value })} /></label>
          <label><span>Practice type</span><input value={form.practice_type} onChange={(event) => setForm({ ...form, practice_type: event.target.value })} /></label>
          <label><span>Area (ha)</span><input type="number" step="0.1" value={form.area_ha} onChange={(event) => setForm({ ...form, area_ha: event.target.value })} /></label>
          <div className="drawer-button-stack"><button type="button" className="btn-ghost" onClick={() => setDrawerOpen(false)}>Cancel</button><button type="submit" className="btn-primary">Log practice</button></div>
        </form>
      </Drawer>
    </div>
  );
}

function GovernanceSection({ sectionData, handlers }) {
  const approvals = sliceRows(sectionData.approvals);
  const audits = sliceRows(sectionData.audits);
  const salesOrders = sliceRows(sectionData.salesOrders);
  const dispatches = sliceRows(sectionData.dispatches);
  const settlements = sliceRows(sectionData.settlements);
  const procurement = sectionData.procurement || { purchase_requests: [] };
  const purchaseRequests = procurement.purchase_requests || [];
  const pendingApprovals = approvals.filter((row) => row.status === "pending");
  const decidedApprovals = approvals.filter((row) => row.status !== "pending");
  const overdueApprovals = pendingApprovals.filter((row) => ageInDays(row.requested_at) >= 7);
  const recentDecisions = recentRows(decidedApprovals, ["decision_at"], 4);
  const recentAuditHighlights = recentRows(audits, ["timestamp"], 4);

  const [tab, setTab] = useState("tracker");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [minAge, setMinAge] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [trackerQuery, setTrackerQuery] = useState("");
  const [trackerActiveId, setTrackerActiveId] = useState(null);
  const [notes, setNotes] = useState("");

  const typeOptions = useMemo(() => {
    const set = new Set();
    pendingApprovals.forEach((row) => { if (row.approval_type) set.add(row.approval_type); });
    return ["all", ...Array.from(set).sort()];
  }, [pendingApprovals]);

  const filteredPending = useMemo(() => {
    return pendingApprovals.filter((row) => {
      if (typeFilter !== "all" && row.approval_type !== typeFilter) return false;
      if (minAge > 0 && ageInDays(row.requested_at) < minAge) return false;
      return true;
    });
  }, [pendingApprovals, typeFilter, minAge]);

  const selection = useSelection(filteredPending);
  const activeRow = useMemo(() => {
    if (tab === "pending") return filteredPending.find((r) => r.id === activeId) || filteredPending[0] || null;
    if (tab === "decided") return decidedApprovals.find((r) => r.id === activeId) || decidedApprovals[0] || null;
    return null;
  }, [tab, activeId, filteredPending, decidedApprovals]);

  useEffect(() => { setNotes(""); }, [activeRow?.id]);

  const savedViewScope = "governance_pending";

  const canDecide = handlers.canAction("decide_approvals");

  const decideActive = (decision) => {
    if (!activeRow || !canDecide) return;
    handlers.onDecideApproval(activeRow.id, decision, notes);
  };

  const bulkDecide = (decision) => {
    if (!selection.count || !canDecide) return;
    handlers.onBulkDecideApprovals(selection.ids, decision, notes);
    selection.clear();
  };

  const navActive = (dir) => {
    const list = tab === "pending" ? filteredPending : decidedApprovals;
    if (!list.length) return;
    const idx = list.findIndex((r) => r.id === activeRow?.id);
    const next = Math.max(0, Math.min(list.length - 1, (idx < 0 ? 0 : idx + dir)));
    setActiveId(list[next].id);
  };

  useHotkeys([
    { key: "k", ctrl: true, allowInInputs: true, handler: () => setPaletteOpen(true) },
    { key: "Escape", allowInInputs: true, handler: () => setPaletteOpen(false) },
    { key: "j", handler: () => navActive(1) },
    { key: "k", handler: () => navActive(-1) },
    { key: "a", handler: () => decideActive("approved") },
    { key: "r", handler: () => decideActive("rejected") },
    { key: "A", shift: true, handler: () => bulkDecide("approved") }
  ]);

  const tabs = [
    { id: "tracker", label: "Tracker", count: pendingApprovals.length, tone: pendingApprovals.length ? "high" : "neutral" },
    { id: "pending", label: "Inbox", count: pendingApprovals.length, tone: pendingApprovals.length ? "high" : "neutral" },
    { id: "decided", label: "Recently decided", count: decidedApprovals.length, tone: "neutral" },
    { id: "audit", label: "Audit", count: audits.length, tone: "neutral" }
  ];

  const commands = useMemo(() => {
    const cmds = [
      { id: "tab-pending", group: "Navigate", label: "Pending approvals", run: () => setTab("pending") },
      { id: "tab-tracker", group: "Navigate", label: "Tracker", run: () => setTab("tracker") },
      { id: "tab-decided", group: "Navigate", label: "Recently decided", run: () => setTab("decided") },
      { id: "tab-audit", group: "Navigate", label: "Audit timeline", run: () => setTab("audit") },
      { id: "approve-active", group: "Action", label: "Approve current", hint: "a", run: () => decideActive("approved") },
      { id: "reject-active", group: "Action", label: "Reject current", hint: "r", run: () => decideActive("rejected") },
      { id: "bulk-approve", group: "Action", label: `Bulk approve selected (${selection.count})`, hint: "Shift+A", run: () => bulkDecide("approved") },
      { id: "bulk-reject", group: "Action", label: `Bulk reject selected (${selection.count})`, run: () => bulkDecide("rejected") }
    ];
    filteredPending.slice(0, 15).forEach((row) => {
      cmds.push({
        id: `approve-${row.id}`,
        group: "Approve",
        label: `Approve ${row.id}`,
        hint: `${titleCase(row.approval_type)} · ${row.entity_id}`,
        run: () => handlers.onDecideApproval(row.id, "approved")
      });
    });
    return cmds;
  }, [filteredPending, selection.count, activeRow]);

  const governanceTrackerItems = useMemo(() => {
    return pendingApprovals.map((row) => {
      const linkedSalesOrder = salesOrders.find((entry) => entry.id === row.entity_id);
      const linkedDispatch = dispatches.find((entry) => entry.sales_order_id === row.entity_id);
      const linkedSettlements = settlements.filter((entry) => entry.sales_order_id === row.entity_id);
      const linkedPr = purchaseRequests.find((entry) => entry.id === row.entity_id);

      if (row.approval_type === "purchase_request") {
        return {
          id: row.id,
          kind: "Purchase approval",
          title: row.entity_id,
          subtitle: joinParts([linkedPr?.item_name, linkedPr?.supplier_name, linkedPr ? `${number(linkedPr.total_qty)} qty` : null]),
          stage: "Needs approval",
          tone: "high",
          bucket: "action",
          current: "The purchase request is complete and waiting on office approval.",
          next: "Approve the PR",
          why: "Procurement cannot raise the purchase order until the PR is approved.",
          owner: "Approvals desk",
          nextStepAction: () => { setTab("pending"); setActiveId(row.id); },
          linked: [
            { label: "PR", value: row.entity_id },
            { label: "Supplier", value: linkedPr?.supplier_name || "-" }
          ],
          actions: [{ label: "Approve PR", onClick: () => handlers.onDecideApproval(row.id, "approved"), disabled: !canDecide }]
        };
      }

      if (row.approval_type === "sales_order") {
        return {
          id: row.id,
          kind: "Sales order approval",
          title: row.entity_id,
          subtitle: joinParts([linkedSalesOrder?.buyer_name, linkedSalesOrder?.crop, linkedSalesOrder ? `${number(linkedSalesOrder.quantity_mt || 0)} MT` : null]),
          stage: "Needs approval",
          tone: "high",
          bucket: "action",
          current: "The sales order is drafted and still waiting on office approval.",
          next: linkedSalesOrder?.source === "agent" ? "Approve the order so dispatch can be created" : "Approve the order",
          why: linkedSalesOrder?.source === "agent" ? "For agent-created orders, approving here unlocks dispatch creation automatically." : "Order execution is blocked until approval is granted.",
          owner: "Approvals desk",
          nextStepAction: () => { setTab("pending"); setActiveId(row.id); },
          linked: [
            { label: "Sales order", value: row.entity_id },
            { label: "Dispatch", value: linkedDispatch?.id || "Not created" }
          ],
          actions: [{ label: "Approve order", onClick: () => handlers.onDecideApproval(row.id, "approved"), disabled: !canDecide }]
        };
      }

      if (row.approval_type === "settlement_release") {
        return {
          id: row.id,
          kind: "Payout release",
          title: row.entity_id,
          subtitle: joinParts([linkedSalesOrder?.buyer_name, linkedSalesOrder?.crop, linkedSettlements.length ? `${linkedSettlements.length} settlements` : null]),
          stage: "Needs release approval",
          tone: "high",
          bucket: "action",
          current: "Buyer payment has been logged and the farmer settlements are ready.",
          next: "Approve the payout release",
          why: "Farmer payments remain blocked until this approval clears.",
          owner: "Approvals desk",
          nextStepAction: () => { setTab("pending"); setActiveId(row.id); },
          linked: [
            { label: "Sales order", value: row.entity_id },
            { label: "Settlements", value: linkedSettlements.length ? linkedSettlements.map((entry) => entry.id).join(", ") : "-" }
          ],
          actions: [{ label: "Approve release", onClick: () => handlers.onDecideApproval(row.id, "approved"), disabled: !canDecide }]
        };
      }

      return {
        id: row.id,
        kind: titleCase(row.approval_type),
        title: row.entity_id,
        subtitle: row.requested_by || "System",
        stage: "Needs decision",
        tone: "high",
        bucket: "action",
        current: row.notes || "This item is pending human review.",
        next: "Approve or reject the approval request",
        why: "The upstream workflow is paused until someone records a decision.",
        owner: "Approvals desk",
        nextStepAction: () => { setTab("pending"); setActiveId(row.id); },
        linked: [{ label: "Entity", value: row.entity_id }],
        actions: [
          { label: "Approve", onClick: () => handlers.onDecideApproval(row.id, "approved"), disabled: !canDecide },
          { label: "Reject", variant: "ghost", onClick: () => handlers.onDecideApproval(row.id, "rejected"), disabled: !canDecide }
        ]
      };
    });
  }, [canDecide, dispatches, handlers, pendingApprovals, purchaseRequests, salesOrders, settlements]);

  const governanceLead = tab === "tracker"
    ? {
        eyebrow: "Approvals tracker",
        title: pendingApprovals.length ? "Review what each approval unlocks before you decide" : "The approval tracker is clear right now",
        summary: "Each approval now explains the downstream effect, so the desk can decide without hunting through other pages.",
        metrics: [
          { label: "Pending", value: number(pendingApprovals.length), detail: "Need a human decision", tone: pendingApprovals.length ? "high" : "normal" },
          { label: "Overdue", value: number(overdueApprovals.length), detail: "Open for 7+ days", tone: overdueApprovals.length ? "high" : "normal" },
          { label: "Recent decisions", value: number(recentDecisions.length), detail: recentDecisions[0]?.decision_at ? `Latest ${compactDateTime(recentDecisions[0].decision_at)}` : "No recent decisions" }
        ],
        status: [
          { label: governanceTrackerItems[0]?.id ? `Top approval ${governanceTrackerItems[0].id}` : "Tracker is clear", tone: pendingApprovals.length ? "high" : "normal" }
        ]
      }
    : tab === "pending"
    ? {
        eyebrow: "Approvals command",
        title: pendingApprovals.length ? "Keep the approval inbox short and easy to scan" : "The approval inbox is currently clear",
        summary: "Pending approvals, recent decisions, and fresh audit events are separated so new decision work does not vanish into the longer compliance history.",
        metrics: [
          { label: "Pending", value: number(pendingApprovals.length), detail: "Need human decision", tone: pendingApprovals.length ? "high" : "normal" },
          { label: "Overdue", value: number(overdueApprovals.length), detail: "Open for 7+ days", tone: overdueApprovals.length ? "high" : "normal" },
          { label: "Recent decisions", value: number(recentDecisions.length), detail: recentDecisions[0]?.decision_at ? `Latest ${compactDateTime(recentDecisions[0].decision_at)}` : "No decisions yet" }
        ],
        status: [
          { label: filteredPending.length ? `${number(filteredPending.length)} approvals match the current filters` : "No pending approvals for current filters", tone: filteredPending.length ? "high" : "normal" },
          { label: recentAuditHighlights[0]?.timestamp ? `Latest audit event ${compactDateTime(recentAuditHighlights[0].timestamp)}` : "No recent audit event", tone: "neutral" }
        ]
      }
    : tab === "decided"
      ? {
          eyebrow: "Decision history",
          title: "Review what changed without opening the entire audit trail",
          summary: "Recent approval outcomes remain visible as a short history so operators can verify what just changed before dropping into the full audit timeline.",
          metrics: [
            { label: "Decided", value: number(decidedApprovals.length), detail: "Closed approval items" },
            { label: "Pending", value: number(pendingApprovals.length), detail: "Still awaiting action", tone: pendingApprovals.length ? "high" : "normal" },
            { label: "Audit events", value: number(audits.length), detail: "System trail on file" }
          ],
          status: [
            { label: recentDecisions[0]?.id ? `Latest decision ${recentDecisions[0].id}` : "No recent decision", tone: "neutral" }
          ]
        }
      : {
          eyebrow: "Audit trail",
          title: "Use the audit timeline as history, not the primary inbox",
          summary: "The audit trail stays available as the reference record, while the latest decisions and pending inbox remain easier to scan above it.",
          metrics: [
            { label: "Audit events", value: number(audits.length), detail: recentAuditHighlights[0]?.timestamp ? `Latest ${compactDateTime(recentAuditHighlights[0].timestamp)}` : "No audit events" },
            { label: "Pending", value: number(pendingApprovals.length), detail: "Still open", tone: pendingApprovals.length ? "high" : "normal" },
            { label: "Overdue", value: number(overdueApprovals.length), detail: "Need escalation", tone: overdueApprovals.length ? "high" : "normal" }
          ],
          status: [
            { label: recentAuditHighlights[0]?.entity ? `Latest ${titleCase(recentAuditHighlights[0].entity)} update` : "No fresh audit highlight", tone: "neutral" }
          ]
        };

  return (
    <div className="stack">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />

      <div className="section-sticky-head">
        <SubTabNav tabs={tabs} active={tab} onChange={setTab} />
        <div className="section-sticky-actions">
          <button type="button" className="btn-ghost" onClick={() => setPaletteOpen(true)}>Commands</button>
        </div>
      </div>

      <SectionLead
        eyebrow={governanceLead.eyebrow}
        title={governanceLead.title}
        summary={governanceLead.summary}
        metrics={governanceLead.metrics}
        status={governanceLead.status}
        actions={<button type="button" className="btn-ghost" onClick={() => setPaletteOpen(true)}>Commands</button>}
        note="The inbox is for active decisions. Recent outcomes and audit history stay close by, but visually quieter."
      />
      {tab === "tracker" ? (
        <TrackerWorkspace
          title="Approval tracker"
          helper="Search an order, PR, or payout release and see exactly what approving it will unlock."
          items={governanceTrackerItems}
          search={trackerQuery}
          onSearchChange={setTrackerQuery}
          activeId={trackerActiveId}
          onActiveIdChange={setTrackerActiveId}
          emptyTitle="No active approvals match the current search."
        />
      ) : null}

      {tab !== "tracker" ? <div className="workboard-grid">
        <WorkboardCard eyebrow="Needs decision" title="Approval inbox" subtitle="New approvals stay separate from the audit stream so fresh work is easy to spot." count={pendingApprovals.length} tone={pendingApprovals.length ? "high" : "normal"}>
          <div className="workboard-list">
            {recentRows(filteredPending, ["requested_at"], 4).length ? recentRows(filteredPending, ["requested_at"], 4).map((row) => (
              <WorkboardItem
                key={row.id}
                title={joinParts([titleCase(row.approval_type), row.entity_id])}
                meta={joinParts([row.id, row.requested_at ? compactDateTime(row.requested_at) : "No timestamp"])}
                detail={row.notes || "Pending approval decision"}
                chips={[<QueueFreshTag key="fresh" />, <SeverityBadge key="status" value={row.status} />]}
              />
            )) : <div className="queue-empty">No approval inbox items at the moment.</div>}
          </div>
        </WorkboardCard>

        <WorkboardCard eyebrow="Overdue" title="Items that may need escalation" subtitle="Older approvals are grouped separately so aging work is not lost in the normal queue." count={overdueApprovals.length} tone={overdueApprovals.length ? "high" : "normal"}>
          <div className="workboard-list">
            {overdueApprovals.length ? recentRows(overdueApprovals, ["requested_at"], 4).map((row) => (
              <WorkboardItem
                key={row.id}
                title={joinParts([row.id, titleCase(row.approval_type)])}
                meta={joinParts([row.entity_id, `${number(ageInDays(row.requested_at) || 0)}d open`])}
                detail={row.requested_by ? `Requested by ${row.requested_by}` : "Requested by system"}
                chips={[<SeverityBadge key="status" value={row.status} />]}
              />
            )) : <div className="queue-empty">Nothing is aging beyond the escalation threshold.</div>}
          </div>
        </WorkboardCard>

      </div> : null}

      {tab === "pending" ? (
        <>
          <div className="match-filter-bar">
            <label className="inline-field">
              <span>Type</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                {typeOptions.map((opt) => <option key={opt} value={opt}>{opt === "all" ? "All types" : titleCase(opt)}</option>)}
              </select>
            </label>
            <label className="inline-field">
              <span>Min age (days)</span>
              <input type="number" min="0" max="30" value={minAge} onChange={(e) => setMinAge(Number(e.target.value) || 0)} />
            </label>
            <SavedViewsBar
              scope={savedViewScope}
              currentFilters={{ typeFilter, minAge }}
              onApply={(f) => { setTypeFilter(f.typeFilter || "all"); setMinAge(f.minAge || 0); }}
            />
          </div>

          <BulkBar
            count={selection.count}
            onClear={selection.clear}
            actions={[
              { label: `Approve ${selection.count}`, disabled: !canDecide, onClick: () => bulkDecide("approved") },
              { label: `Reject ${selection.count}`, disabled: !canDecide, onClick: () => bulkDecide("rejected"), variant: "ghost" }
            ]}
          />

          <div className="market-split">
            <div className="market-split-list">
              <div className="market-split-head">
                <div>
                  <strong>Choose an approval</strong>
                  <span className="selection-pane-note">Select a card to review the exact approval details on the right.</span>
                </div>
                {activeRow ? <span className="selection-active-pill">{activeRow.id}</span> : <span className="hint">Inbox ({filteredPending.length})</span>}
              </div>
              <div className="queue-action-list queue-action-list-compact">
                {filteredPending.length ? filteredPending.map((row) => (
                  <QueueActionRow
                    key={row.id}
                    id={row.id}
                    selected={selection.selected.has(row.id)}
                    onSelect={() => selection.toggle(row.id)}
                    active={activeRow?.id === row.id}
                    onClick={() => setActiveId(row.id)}
                    title={joinParts([titleCase(row.approval_type), row.entity_id])}
                    meta={joinParts([row.id, row.requested_at ? compactDateTime(row.requested_at) : "No timestamp"])}
                    chips={[<AgeBadge key="age" date={row.requested_at} />]}
                  />
                )) : <div className="queue-empty">No pending approvals match filters.</div>}
              </div>
            </div>
            <div className="market-split-detail">
              <div className="selection-pane-head selection-pane-head-detail">
                <div>
                  <strong>Selected approval</strong>
                  <span className="selection-pane-note">This panel mirrors the highlighted approval on the left.</span>
                </div>
                {activeRow ? <span className="selection-active-pill">{activeRow.id}</span> : null}
              </div>
              {activeRow ? (
                <>
                  <div className="match-detail-head">
                    <strong>{titleCase(activeRow.approval_type)}</strong>
                    <AgeBadge date={activeRow.requested_at} />
                  </div>
                  <div className="match-detail-sub">{activeRow.entity_id}</div>
                  <div className="match-detail-grid">
                    <div><span className="hint">Approval</span><div>{activeRow.id}</div></div>
                    <div><span className="hint">Requested</span><div>{compactDateTime(activeRow.requested_at)}</div></div>
                    <div><span className="hint">By</span><div>{activeRow.requested_by || "System"}</div></div>
                    <div><span className="hint">Notes</span><div>{activeRow.notes || "-"}</div></div>
                  </div>
                  <label className="inline-field">
                    <span>Decision notes</span>
                    <textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes recorded on decision" />
                  </label>
                  <div className="match-detail-actions">
                    <button type="button" className="btn-primary" disabled={!canDecide} onClick={() => decideActive("approved")}>Approve (a)</button>
                    <button type="button" className="btn-ghost" disabled={!canDecide} onClick={() => decideActive("rejected")}>Reject (r)</button>
                  </div>
                </>
              ) : <div className="queue-empty">No pending approvals match filters.</div>}
            </div>
          </div>
        </>
      ) : null}

      {tab === "decided" ? (
        <TableCard title="Recently decided">
          <DataTable
            columns={[
              { key: "id", label: "Approval" },
              { key: "approval_type", label: "Type", render: (v) => titleCase(v) },
              { key: "entity_id", label: "Entity" },
              { key: "status", label: "Status", render: (v) => <SeverityBadge value={v} /> },
              { key: "decision_by", label: "Decided by" },
              { key: "decision_at", label: "Decided at", render: (v) => v ? compactDateTime(v) : "—" },
              { key: "notes", label: "Notes" }
            ]}
            rows={decidedApprovals}
          />
        </TableCard>
      ) : null}

      {tab === "audit" ? (
        <TableCard title="Audit timeline">
          <DataTable
            columns={[
              { key: "timestamp", label: "Timestamp" },
              { key: "entity", label: "Entity" },
              { key: "entity_id", label: "Entity ID" },
              { key: "action", label: "Action" },
              { key: "notes", label: "Notes" }
            ]}
            rows={audits}
          />
        </TableCard>
      ) : null}
    </div>
  );
}

function ReportsSection({ sectionData, handlers }) {
  const kpis = sectionData.kpis || {};

  return (
    <div className="stack">
      <div className="section-toolbar">
        <div className="stat-grid">
          <StatCard label="Input Demand Completion" value={`${number(kpis.input_demand_completion_rate, 2)}%`} />
          <StatCard label="Settlement Paid Rate" value={`${number(kpis.settlement_paid_rate, 2)}%`} />
          <StatCard label="Connected Buyers" value={number(kpis.connected_buyers)} />
          <StatCard label="Repeat Buyers" value={number(kpis.repeat_buyers)} />
          <StatCard label="Open Escalations" value={number(kpis.open_escalations)} tone="high" />
          <StatCard label="Pending Approvals" value={number(kpis.pending_approvals)} tone="medium" />
        </div>
        <div className="toolbar-actions"><button type="button" className="btn-ghost" disabled={!handlers.canAction("export_reports")} onClick={() => handlers.onDownloadReport("inventory_movement")}>Inventory CSV</button><button type="button" className="btn-ghost" disabled={!handlers.canAction("export_reports")} onClick={() => handlers.onDownloadReport("settlement_ageing")}>Settlement CSV</button></div>
      </div>
    </div>
  );
}
