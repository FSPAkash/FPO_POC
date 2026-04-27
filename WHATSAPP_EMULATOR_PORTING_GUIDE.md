# WhatsApp Emulator — Porting Guide for Other Projects

Audience: Codex / Claude / any agent implementing a mock WhatsApp module from scratch.
Goal: build a dual-perspective WhatsApp emulator (end-user phone + internal operator console) over a shared chat dataset, adapted to the host project's data model and either an agentic or non-agentic backend.

This document is **self-contained**. You do not need access to any other repository to follow it. All code below is reference implementation — adapt names and side-effects to your host project's domain.

---

## 1. What This Module Is

A **simulation layer**, not a real WhatsApp Business API integration. Two synchronized views over one shared chat dataset:

| View | Persona | UI shape |
|------|---------|----------|
| **Phone view** | End user (customer / field user / whoever the host project's "user" is) | Floating draggable phone widget, WhatsApp-style chat |
| **Office view** | Internal operator handling tickets | 3-column kanban (New / In Progress / Resolved) + detail panel + reply box |

Both views read/write the **same conversation thread**, so an action on one side is visible on the other within one refresh cycle. This is the entire point — demonstrate a closed loop without a real messaging provider.

### Out of scope (do not build)
- Meta WhatsApp Business API integration
- Real delivery receipts / template governance
- Media upload pipeline
- Production identity / consent flow

---

## 2. Core Mental Model — What You Must Replicate

Three concepts. If any of these are missing, the module will feel broken.

### 2.1 Shared chat thread per user
One append-only list of message rows, each with `direction = "incoming" | "outgoing"`. Both views render from this list filtered by user id.

### 2.2 Ticket status lifecycle
Inbound user messages become **tickets** with status:
```
pending  →  in_progress  →  resolved
```
- `pending`: new inbound, never opened
- `in_progress`: operator clicked "Open" (status change only — no synthetic chat)
- `resolved`: operator replied, OR explicitly resolved without reply, OR auto-replied by an agent

**Critical rule**: opening a ticket must ONLY change status + select context. It must NOT inject any message into the thread. Adding a "ticket opened" message is the most common porting mistake.

### 2.3 Intent classification with side-effects
Inbound text is parsed into one or more intents via simple keyword heuristics. Each intent triggers a domain side-effect (e.g. create order row, create support ticket, fetch latest price, log a request). The reference intents below (`price_query`, `input_request`, `support_query`, `status_update`) are illustrative — replace them with whatever your project's domain needs. The **mechanism** is the contract, not the specific intent set.

---

## 3. Backend API Contract

These endpoints are the integration boundary. Names are suggestions; keep the **shapes** identical so the frontend code below ports cleanly.

### 3.1 Thread (read)
```
GET /api/communication/mock-whatsapp/thread?user_id=<id>&page_size=80
```
Returns array (or `{items: [...]}`) of chat rows, sorted descending by timestamp (frontend re-sorts ascending for display):
```json
{
  "id": "CHAT-000123",
  "user_id": "U-007",
  "direction": "incoming",   // or "outgoing"
  "intent": "price_query",
  "severity": "NORMAL",      // or "HIGH"
  "status": "pending",
  "message_id": "MSG-000045", // links chat row to ticket (incoming) or to ticket being replied (outgoing)
  "text": "What is today's price?",
  "timestamp": "2026-04-26T10:15:00Z"
}
```

### 3.2 Inbound from user (send)
```
POST /api/communication/mock-whatsapp/send
Body: { "user_id": "U-007", "text": "...", "intent": "optional override", "auto_reply": false }
```
Server must:
1. Validate `user_id`, `text`.
2. Classify intent(s) from text.
3. Create a `message_log` row with `status: "pending"`.
4. Append an `incoming` chat row referencing that message id.
5. Apply intent side-effects (create domain records, look up data).
6. If `auto_reply == true` AND no agentic auto-reply layer is enabled, append an `outgoing` chat row with the canned response and mark message `resolved`.
7. If an agentic layer is enabled (see §6), invoke it instead and let it produce the outgoing chat row.
8. Return `{ status, message_id, intent, response_text, created_records }`.

### 3.3 Office reply
```
POST /api/communication/mock-whatsapp/reply
Body: { "user_id": "U-007", "text": "...", "message_id": "MSG-000045" }
```
Server must:
1. Resolve target ticket: prefer the explicit `message_id`; otherwise pick the most recent `in_progress` for that user, else the most recent `pending`.
2. Append an `outgoing` chat row with `message_id` = target ticket id.
3. Mark the target ticket `resolved` and stamp `resolved_at`.

### 3.4 Status transition
```
POST /api/communication/messages/<message_id>/status
Body: { "status": "in_progress" | "resolved" | "pending" }
```
Whitelist allowed values, 400 otherwise. Stamp `in_progress_at` / `resolved_at` on transition. **Do not** write any chat row here.

### 3.5 Inbox (ticket list)
```
GET /api/communication/inbox
```
Returns `message_log` rows sorted by timestamp descending. The Office view filters this client-side into the three lanes by `status`. Optionally support an `escalated_only=true` filter if your project has an escalation concept; otherwise omit it.

### 3.6 Lookups
```
GET /api/lookups   →  { users: [...] }   // or whatever your user list is
```
Used by both views to populate the user selector and resolve names.

---

## 4. Backend Reference Implementation (Flask, dataset = in-memory dict)

Adapt to your stack. Names below are deliberately generic (`user`, `message_log`, `chat_threads`) — rename to whatever your domain uses (e.g. `customer`, `field_user`, `member`).

### 4.1 Intent classification
```python
def _infer_intents(text: str) -> list[str]:
    t = text.lower()
    intents = []
    if any(k in t for k in ["price", "rate"]):           intents.append("price_query")
    if any(k in t for k in ["need", "order", "buy"]):    intents.append("input_request")
    if any(k in t for k in ["broken", "issue", "error"]):intents.append("support_query")
    if any(k in t for k in ["update", "status"]):        intents.append("status_update")
    return intents or ["general_query"]

def _infer_intent(text: str) -> str:
    intents = _infer_intents(text)
    significant = [i for i in intents if i != "general_query"]
    return "multi_intent" if len(significant) > 1 else intents[0]
```
Rule: if your project has different domain verbs (e.g. logistics: "pickup", "delivery", "delay"), replace the keyword sets — the function shape stays identical.

### 4.2 Simulate inbound message
```python
def _simulate_inbound(user_id: str, text: str, intent: str | None = None,
                     auto_reply: bool = False) -> dict:
    user = _find_user(user_id)
    if not user:
        raise ValueError("Invalid user_id")

    intents = [intent] if intent else _infer_intents(text)
    intents = [i for i in intents if i] or ["general_query"]
    primary = "multi_intent" if len([i for i in intents if i != "general_query"]) > 1 else intents[0]
    severity = "HIGH" if "support_query" in intents else "NORMAL"
    ts = _utc_now()

    msg_id = _next_id("MSG", DATASET["message_logs"])
    DATASET["message_logs"].append({
        "id": msg_id,
        "user_id": user["id"],
        "intent": primary,
        "intents": intents,
        "severity": severity,
        "timestamp": ts,
        "text": text,
        "status": "pending",
        "in_progress_at": None,
        "resolved_at": None,
        "created_records": {},
        "escalated": False,
    })
    DATASET["chat_threads"].append({
        "id": _next_id("CHAT", DATASET["chat_threads"]),
        "user_id": user["id"],
        "direction": "incoming",
        "intent": primary,
        "severity": severity,
        "status": "pending",
        "message_id": msg_id,
        "text": text,
        "timestamp": ts,
    })

    response_fragments, created = [], {}
    # ---- Project-specific side effects go here ----
    # if "input_request" in intents: create demand row, append fragment ...
    # if "support_query"  in intents: create ticket/escalation, append fragment ...
    # if "price_query"    in intents: look up latest price, append fragment ...

    response_text = " ".join(response_fragments) or "Message captured."

    if auto_reply:
        DATASET["chat_threads"].append({
            "id": _next_id("CHAT", DATASET["chat_threads"]),
            "user_id": user["id"],
            "direction": "outgoing",
            "intent": primary,
            "severity": "NORMAL",
            "status": "sent",
            "message_id": msg_id,
            "text": response_text,
            "timestamp": _utc_now(),
        })
        msg = next(m for m in DATASET["message_logs"] if m["id"] == msg_id)
        msg["status"] = "resolved"
        msg["resolved_at"] = _utc_now()
        msg["in_progress_at"] = msg.get("in_progress_at") or msg["resolved_at"]

    return {"message_id": msg_id, "intent": primary,
            "response_text": response_text, "created_records": created}
```

### 4.3 Office reply
```python
def _office_reply(user_id: str, text: str, message_id: str | None = None) -> dict:
    user = _find_user(user_id)
    if not user:
        raise ValueError("Invalid user_id")

    target = None
    if message_id:
        target = next((m for m in DATASET["message_logs"]
                       if m["id"] == message_id and m["user_id"] == user_id), None)
    if not target:
        for status in ("in_progress", "pending"):
            target = next((m for m in sorted(DATASET["message_logs"],
                                             key=lambda r: r["timestamp"], reverse=True)
                           if m["user_id"] == user_id and m["status"] == status), None)
            if target: break

    ts = _utc_now()
    DATASET["chat_threads"].append({
        "id": _next_id("CHAT", DATASET["chat_threads"]),
        "user_id": user["id"],
        "direction": "outgoing",
        "intent": target["intent"] if target else "reply",
        "severity": "NORMAL",
        "status": "sent",
        "message_id": target["id"] if target else None,
        "text": text,
        "timestamp": ts,
    })
    if target:
        target["status"] = "resolved"
        target["resolved_at"] = ts
        target["in_progress_at"] = target.get("in_progress_at") or ts
    return {"message_id": target["id"] if target else None}
```

### 4.4 Routes
```python
@app.route("/api/communication/mock-whatsapp/thread", methods=["GET"])
def thread():
    rows = DATASET["chat_threads"]
    user_id = request.args.get("user_id")
    if user_id:
        rows = [r for r in rows if r["user_id"] == user_id]
    rows = sorted(rows, key=lambda r: r["timestamp"], reverse=True)
    return jsonify(_paginate(rows))

@app.route("/api/communication/mock-whatsapp/send", methods=["POST"])
def send():
    body = request.get_json(silent=True) or {}
    user_id = str(body.get("user_id", "")).strip()
    text    = str(body.get("text", "")).strip()
    if not user_id or not text:
        return jsonify({"error": "user_id and text required"}), 400
    try:
        result = _simulate_inbound(user_id, text,
                                   intent=body.get("intent"),
                                   auto_reply=bool(body.get("auto_reply", False)))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"status": "sent", **result})

@app.route("/api/communication/mock-whatsapp/reply", methods=["POST"])
def reply():
    body = request.get_json(silent=True) or {}
    user_id    = str(body.get("user_id", "")).strip()
    text       = str(body.get("text", "")).strip()
    message_id = str(body.get("message_id", "")).strip() or None
    if not user_id or not text:
        return jsonify({"error": "user_id and text required"}), 400
    try:
        result = _office_reply(user_id, text, message_id=message_id)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"status": "replied", **result})

@app.route("/api/communication/messages/<message_id>/status", methods=["POST"])
def set_status(message_id):
    body = request.get_json(silent=True) or {}
    status = str(body.get("status", "")).strip().lower()
    if status not in {"pending", "in_progress", "resolved"}:
        return jsonify({"error": "invalid status"}), 400
    row = next((m for m in DATASET["message_logs"] if m["id"] == message_id), None)
    if not row:
        return jsonify({"error": "not found"}), 404
    ts = _utc_now()
    row["status"] = status
    if status == "in_progress" and not row.get("in_progress_at"):
        row["in_progress_at"] = ts
    if status == "resolved" and not row.get("resolved_at"):
        row["resolved_at"] = ts
    return jsonify({"status": "updated", "message_status": status})
```

If your stack is FastAPI / Express / Django REST, the body shapes and status code conventions stay identical.

---

## 5. Frontend Reference Implementation (React)

Two components: floating phone (always visible), full office console (inside a "Communication" page/section).

### 5.1 API client (`api.js`)
```js
export const api = {
  lookups: () => getJson("/api/lookups"),
  communicationThread: (userId = "", pageSize = 60) =>
    getJson(`/api/communication/mock-whatsapp/thread?page_size=${pageSize}` +
            (userId ? `&user_id=${encodeURIComponent(userId)}` : "")),
  communicationSend:  (payload) => postJson("/api/communication/mock-whatsapp/send",  payload),
  communicationReply: (payload) => postJson("/api/communication/mock-whatsapp/reply", payload),
  communicationSetStatus: (messageId, status) =>
    postJson(`/api/communication/messages/${messageId}/status`, { status }),
  communicationInbox: () => getAllPages("/api/communication/inbox"),
};
```

### 5.2 Floating phone component
Adapt these substantive parts (drag, draggable position, panel/FAB toggle, scenario buttons, send form). Rename `User` / `users` to whatever entity your project uses:

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";

const DEFAULT_POS = { right: 24, bottom: 24 };
const formatTime = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
};

export function FloatingUserPhone({ canCommunicate = true, onActivity }) {
  const [open, setOpen]       = useState(true);
  const [users, setUsers]     = useState([]);
  const [selectedId, setId]   = useState("");
  const [thread, setThread]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [text, setText]       = useState("");
  const [sending, setSending] = useState(false);
  const [pos, setPos]         = useState(null);
  const dragRef  = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.lookups().then((lk) => {
      if (cancelled) return;
      const list = lk?.users || [];
      setUsers(list);
      if (!selectedId && list[0]?.id) setId(list[0].id);
    }).catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadThread = useCallback(async (uid) => {
    if (!uid) { setThread([]); return; }
    setLoading(true);
    try {
      const payload = await api.communicationThread(uid);
      const rows = Array.isArray(payload) ? payload : (payload.items || []);
      const sorted = [...rows].sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
        if (ta === tb) return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
        return ta - tb;
      });
      setThread(sorted);
    } catch { setThread([]); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { loadThread(selectedId); }, [selectedId, loadThread]);

  const selectedUser = users.find((u) => u.id === selectedId);

  async function submit(e) {
    e.preventDefault();
    if (!text.trim() || !selectedId || !canCommunicate) return;
    setSending(true);
    try {
      await api.communicationSend({ user_id: selectedId, text: text.trim(), auto_reply: false });
      setText("");
      await loadThread(selectedId);
      onActivity?.();
    } finally { setSending(false); }
  }

  // --- drag (panel only, ignore form controls) ---
  const onPointerDown = (e) => {
    if (e.target.closest("button, select, input, a, form")) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      width: rect.width, height: rect.height,
    };
    e.target.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const { offsetX, offsetY, width, height } = dragRef.current;
    setPos({
      left: Math.max(8, Math.min(window.innerWidth  - width  - 8, e.clientX - offsetX)),
      top:  Math.max(8, Math.min(window.innerHeight - height - 8, e.clientY - offsetY)),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const style = open && pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : { right: DEFAULT_POS.right, bottom: DEFAULT_POS.bottom, left: "auto", top: "auto" };

  return (
    <div className={`floating-phone ${open ? "open" : "collapsed"}`} style={style}>
      {open ? (
        <div
          ref={panelRef}
          className="floating-phone-panel"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="floating-phone-titlebar floating-phone-drag-handle">
            <div className="floating-phone-titlebar-info">
              <span className="floating-phone-badge">MOCK</span>
              <span className="floating-phone-title">User WhatsApp</span>
            </div>
            <button type="button" className="floating-phone-close"
                    onClick={() => { setOpen(false); setPos(null); }}
                    aria-label="Minimize phone" title="Minimize">&ndash;</button>
          </div>

          <label className="floating-phone-user">
            <span>User</span>
            <select value={selectedId} onChange={(e) => setId(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>

          <div className="phone-frame floating-phone-frame">
            <div className="phone-screen">
              <div className="wa-header">
                <div className="wa-avatar" />
                <div>
                  <div className="wa-name">Help Desk</div>
                  <div className="wa-status">{selectedUser?.name || "No user selected"}</div>
                </div>
              </div>
              <div className="wa-thread">
                {loading ? <p className="wa-queue-empty">Loading thread...</p> : null}
                {!loading && !thread.length ? <p className="wa-queue-empty">No messages yet.</p> : null}
                {thread.slice(-18).map((row) => (
                  // NOTE: incoming from user is rendered as outgoing bubble in the phone
                  // (the user is "us" here), and vice versa. Keep this mirror.
                  <div key={row.id} className={`wa-bubble ${row.direction === "incoming" ? "outgoing" : "incoming"}`}>
                    <div>{row.text}</div>
                    <div className="wa-time">{formatTime(row.timestamp)}</div>
                  </div>
                ))}
              </div>
              <form className="wa-input-bar" onSubmit={submit}>
                <input className="wa-input" value={text}
                       onChange={(e) => setText(e.target.value)}
                       placeholder="Type message..." />
                <button type="submit" className="wa-send-btn"
                        disabled={sending || !canCommunicate || !selectedId || !text.trim()}>
                  <span>{">"}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Optional scenario shortcuts — replace text with project-relevant prompts */}
          <div className="floating-phone-scenarios">
            <button type="button" className="btn-ghost btn-small"
                    onClick={() => setText("Need to place an order.")}>Order</button>
            <button type="button" className="btn-ghost btn-small"
                    onClick={() => setText("What is today's price?")}>Price</button>
            <button type="button" className="btn-ghost btn-small"
                    onClick={() => setText("Something is broken.")}>Issue</button>
          </div>
        </div>
      ) : (
        <button type="button" className="floating-phone-fab"
                onClick={() => setOpen(true)} aria-label="Open mock phone">
          <span className="floating-phone-fab-icon">WA</span>
          <span className="floating-phone-fab-label">User phone</span>
        </button>
      )}
    </div>
  );
}
```

### 5.3 Office console (Jira-style 3-lane board + detail panel)

```jsx
function OfficeConsole({ inbox, users, canCommunicate, handlers }) {
  const [selectedUserId, setUserId] = useState("");
  const [selectedMsgId,  setMsgId]  = useState("");
  const [officeText, setOfficeText] = useState("");
  const [threadRows, setThreadRows] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortOrder,  setSort]       = useState("newest");

  const filtered = inbox
    .filter((r) => typeFilter === "all" || r.escalation_category === typeFilter)
    .slice()
    .sort((a, b) => {
      const da = new Date(a.timestamp).getTime();
      const db = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? db - da : da - db;
    });
  const lanes = {
    pending:     filtered.filter((r) => r.status === "pending"),
    in_progress: filtered.filter((r) => r.status === "in_progress"),
    resolved:    filtered.filter((r) => r.status === "resolved"),
  };
  const selectedTicket = inbox.find((r) => r.id === selectedMsgId) || null;
  const selectedUser   = users.find((u) => u.id === (selectedTicket?.user_id || selectedUserId)) || null;

  // Init: pick first ticket
  const init = useState(false);
  useEffect(() => {
    if (init[0]) return;
    const first = lanes.pending[0] || lanes.in_progress[0] || lanes.resolved[0];
    if (first) { setMsgId(first.id); setUserId(first.user_id); init[1](true); }
    else if (!selectedUserId && users.length) setUserId(users[0].id);
  }, [inbox, users, init, lanes, selectedUserId]);

  // Load thread for current ticket's user
  useEffect(() => {
    let active = true;
    (async () => {
      const uid = selectedTicket?.user_id;
      if (!uid) { setThreadRows([]); return; }
      setLoading(true);
      try {
        const payload = await api.communicationThread(uid, 80);
        const rows = Array.isArray(payload) ? payload : (payload.items || []);
        if (active) setThreadRows(rows.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [selectedTicket?.user_id, selectedTicket?.id]);

  async function openTicket(ticket) {
    if (!ticket) return;
    setMsgId(ticket.id);
    setUserId(ticket.user_id);
    setOfficeText("");
    // Critical rule: opening transitions status only — no synthetic chat row.
    if (canCommunicate && ticket.status === "pending") {
      await handlers.onSetStatus(ticket.id, "in_progress");
    }
  }

  async function submitReply(e) {
    e.preventDefault();
    if (!canCommunicate || !selectedTicket || !officeText.trim()) return;
    await handlers.onOfficeReply({
      user_id: selectedTicket.user_id, text: officeText.trim(),
      message_id: selectedTicket.id,
    });
    setOfficeText("");
  }

  const statusLabel = (s) => s === "pending" ? "New" : s === "in_progress" ? "In Progress" : "Resolved";
  const laneClass   = (s) => s === "pending" ? "jira-lane-warn" : s === "in_progress" ? "jira-lane-info" : "jira-lane-ok";
  const nextStatus  = (s) => s === "pending" ? "in_progress" : s === "in_progress" ? "resolved" : "in_progress";

  const columns = [
    { id: "pending",     title: "New",         rows: lanes.pending },
    { id: "in_progress", title: "In Progress", rows: lanes.in_progress },
    { id: "resolved",    title: "Resolved",    rows: lanes.resolved },
  ];

  return (
    <div className="whatsapp-layout">
      <div className="office-console glass-normal">
        <div className="jira-board-layout">
          <div className="jira-board-panel">
            <div className="jira-board-head"><h3>Handoff Desk</h3></div>
            <div className="jira-board-grid">
              {columns.map((col) => (
                <section key={col.id} className={`jira-lane ${laneClass(col.id)}`}>
                  <div className="jira-lane-head">
                    <div><h4>{col.title}</h4></div>
                    <span className="jira-lane-count">{col.rows.length}</span>
                  </div>
                  <div className="jira-lane-list">
                    {!col.rows.length ? <p className="jira-lane-empty">No tickets</p> : null}
                    {col.rows.map((row) => (
                      <button key={row.id} type="button"
                              className={`jira-card ${selectedMsgId === row.id ? "active" : ""}`}
                              onClick={() => openTicket(row)}>
                        <div className="jira-card-top">
                          <span className="jira-ticket-key">{row.id.slice(-6).toUpperCase()}</span>
                          <span className={`badge ${row.status === "pending" ? "badge-warn" : row.status === "in_progress" ? "badge-info" : "badge-ok"}`}>
                            {statusLabel(row.status)}
                          </span>
                        </div>
                        <div className="jira-card-body">
                          <strong className="jira-ticket-summary">{row.text}</strong>
                          <span className="jira-ticket-meta">{row.user_name || row.user_id}</span>
                        </div>
                        <div className="jira-card-bottom">
                          <span>{row.intent}</span>
                          <button type="button" className="btn-ghost btn-small"
                                  disabled={!canCommunicate}
                                  onClick={(e) => { e.stopPropagation();
                                    handlers.onSetStatus(row.id, nextStatus(row.status)); }}>
                            {row.status === "pending" ? "Start" : row.status === "in_progress" ? "Resolve" : "Reopen"}
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
                    <h4>{selectedUser?.name || selectedTicket.user_id}</h4>
                    <span className="jira-detail-id">{selectedTicket.id}</span>
                  </div>
                </div>
                <div className="jira-detail-body">
                  <div className="jira-detail-summary-card">
                    <div className="jira-detail-summary-row jira-detail-summary-text">
                      <span className="jira-detail-field">Issue</span>
                      <p>{selectedTicket.text}</p>
                    </div>
                  </div>
                  <div className="jira-thread">
                    {loading ? <p className="wa-queue-empty">Loading...</p> : null}
                    {!loading && !threadRows.length ? <p className="wa-queue-empty">No messages</p> : null}
                    {threadRows.slice(-12).map((row) => (
                      <div key={row.id} className={`jira-msg ${row.direction === "incoming" ? "incoming" : "outgoing"}`}>
                        <span className="jira-msg-author">{row.direction === "incoming" ? selectedUser?.name : "Office"}</span>
                        <p className="jira-msg-text">{row.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <form className="jira-reply" onSubmit={submitReply}>
                  <textarea rows={2} value={officeText}
                            onChange={(e) => setOfficeText(e.target.value)}
                            placeholder="Reply..." />
                  <div className="jira-reply-actions">
                    <button type="submit" className="btn-primary"
                            disabled={!canCommunicate || !officeText.trim()}>Send</button>
                    {selectedTicket.status !== "resolved" ? (
                      <button type="button" className="btn-ghost"
                              disabled={!canCommunicate}
                              onClick={() => handlers.onSetStatus(selectedTicket.id, "resolved")}>
                        Resolve
                      </button>
                    ) : null}
                  </div>
                </form>
              </>
            ) : (
              <div className="jira-detail-empty"><p>Select a ticket</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 5.4 Wiring at app root
```jsx
// App.jsx
import { FloatingUserPhone } from "./components/phone/FloatingUserPhone";

async function handleSend(payload)   { return api.communicationSend(payload); }
async function handleReply(payload)  { return api.communicationReply(payload); }
async function handleStatus(id, st)  { return api.communicationSetStatus(id, st); }

// ...inside render
<>
  <RouterOutlet handlers={{
    onSendMessage: handleSend,
    onOfficeReply: handleReply,
    onSetStatus:   handleStatus,
  }} />
  <FloatingUserPhone canCommunicate={true} onActivity={refetchInbox} />
</>
```

After every send/reply/status call, **refetch the inbox and the active thread**. Stale UI is the most common bug.

---

## 6. Adapting to the Host Project's Agentic Flow

Three reply modes are supported. Pick the one that matches your project:

| Mode | What it does | When to use |
|------|--------------|-------------|
| `auto_reply=false`, no agent | Office must reply manually | Manual mode — operator-driven demos |
| `auto_reply=true` (no agent) | Server returns canned `response_text` and marks ticket resolved | Use if you have NO agentic layer |
| Agent auto-reply (config flag) | On send, server invokes agent which posts an outgoing chat row and resolves the ticket | Use if you have an agentic layer |

### 6.1 Non-agentic project (no LLM / no autonomous loop)
- Drop the `agent_result`/`agent_warning` fields from `/send` response.
- Drop the `Agent Reply` button in the office console.
- The intent side-effects in `_simulate_inbound` ARE your "agent" — they are just deterministic Python.
- Set `auto_reply=True` from the floating phone if you want immediate canned replies; otherwise leave manual.

### 6.2 Agentic project (LLM, tool-using agent, autonomous loops)
Add an indirection point named `_generate_agent_reply(message_id)` that wraps your existing agent. The contract:
- Input: the `message_id` of the just-stored inbound message.
- Behavior: agent reads message + context, decides whether to reply, optionally creates domain records, then appends an `outgoing` chat row tied to the original `message_id` (same write that `/reply` does — extract it into a `_post_outgoing_chat` helper to share).
- Output: `{ "agent_message_id": "...", "text": "...", "tools_used": [...] }`.

Sketch:
```python
def _generate_agent_reply(message_id: str) -> dict:
    msg = _find_message(message_id)
    if not msg: raise ValueError("message not found")
    if _message_has_agent_reply(message_id):
        raise ValueError("already replied")

    # Plug your agent here. Examples:
    #   - LangChain / LangGraph node
    #   - Claude Agent SDK ClaudeSDKClient
    #   - direct Anthropic SDK call with tool-use loop
    reply_text, tools_used = my_agent.run(
        prompt=msg["text"],
        context={"user": _find_user(msg["user_id"]), "intent": msg["intent"]},
    )

    chat = _post_outgoing_chat(_find_user(msg["user_id"]), reply_text,
                               message=msg, status="resolved", agent_generated=True)
    return {"agent_message_id": chat["id"], "text": reply_text, "tools_used": tools_used}
```
Add a config endpoint (`GET /api/communication/agent-config`) returning:
```json
{ "agent_auto_reply_enabled": true, "reply_mode": "agent" | "manual" | "auto", "last_error": null }
```
The Office console disables the "Agent Reply" button when `agent_auto_reply_enabled` is true (agent already handled it) or when this ticket already has an agent-generated reply (prevents double replies).

### 6.3 Where the agent boundary lives
Pick **one** of these — do not try to do both:
- **Per-message synchronous**: agent runs inside `/send`. Latency is visible to the user but flow is simple. Good for a POC.
- **Background queue**: `/send` returns immediately; a worker / scheduler / loop picks up `pending` messages and runs the agent. Use this only if your project already has a background worker — otherwise it adds infra for no demo benefit.

---

## 7. CSS (drop-in)

**Minimum** required selectors for visual parity:
```css
/* Floating phone container */
.floating-phone { position: fixed; z-index: 60; pointer-events: none; }
.floating-phone > * { pointer-events: auto; }
.floating-phone-panel {
  width: 320px; padding: 14px 14px 12px; border-radius: 24px;
  background: rgba(255,255,255,0.82);
  backdrop-filter: saturate(160%) blur(18px);
  border: 1px solid rgba(27,94,32,0.08);
  box-shadow: 0 24px 60px rgba(27,94,32,0.22), 0 6px 18px rgba(27,94,32,0.12),
              inset 0 1px 0 rgba(255,255,255,0.9);
  display: flex; flex-direction: column; gap: 10px;
  animation: floatingPhoneIn 0.35s cubic-bezier(0.22,1,0.36,1);
  touch-action: none;
}
@keyframes floatingPhoneIn {
  from { opacity: 0; transform: translateY(20px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
.floating-phone-drag-handle { cursor: grab; user-select: none; }
.floating-phone-titlebar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.floating-phone-titlebar-info { display: flex; align-items: center; gap: 8px; }
.floating-phone-badge {
  font-size: 9px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: #fff;
  background: linear-gradient(135deg, #ffb300, #ff7043);
  padding: 3px 7px; border-radius: 999px;
}
.floating-phone-close { width: 24px; height: 24px; border-radius: 50%; background: rgba(0,0,0,0.04); cursor: pointer; }
.floating-phone-frame { width: 100%; height: 440px; border-radius: 28px; padding: 8px; }
.floating-phone-frame .phone-screen { border-radius: 22px; }
.floating-phone-fab {
  display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px;
  border-radius: 999px; background: linear-gradient(135deg, #25d366, #128c7e);
  color: #fff; border: none; cursor: pointer;
  box-shadow: 0 10px 24px rgba(18,140,126,0.32);
  animation: floatingPhoneFabPulse 2.4s ease-in-out infinite;
}
@keyframes floatingPhoneFabPulse {
  0%,100% { box-shadow: 0 10px 24px rgba(18,140,126,0.32), 0 0 0 0 rgba(37,211,102,0.4); }
  50%     { box-shadow: 0 10px 24px rgba(18,140,126,0.32), 0 0 0 10px rgba(37,211,102,0); }
}

/* Phone chat surface */
.phone-frame  { width: 100%; max-width: 300px; height: 560px; border-radius: 36px;
                background: #1c1c1e; padding: 10px; }
.phone-screen { width: 100%; height: 100%; border-radius: 28px; background: #ece5dd;
                overflow: hidden; display: flex; flex-direction: column; }
.wa-header  { height: 56px; background: #075e54; display: flex; align-items: center;
              padding: 0 12px; gap: 10px; }
.wa-avatar  { width: 34px; height: 34px; border-radius: 50%;
              background: linear-gradient(135deg, #25d366, #128c7e); }
.wa-name    { font-size: 15px; font-weight: 600; color: #fff; }
.wa-status  { font-size: 11px; color: rgba(255,255,255,0.7); }
.wa-thread  { flex: 1; overflow-y: auto; padding: 10px 10px 6px;
              display: flex; flex-direction: column; gap: 4px; }
.wa-bubble  { max-width: 72%; padding: 7px 9px 4px; border-radius: 8px;
              font-size: 13px; line-height: 1.45; color: #3c4043; }
.wa-bubble.incoming { background: #fff;     border-radius: 0 8px 8px 8px; align-self: flex-start; }
.wa-bubble.outgoing { background: #dcf8c6; border-radius: 8px 8px 0 8px; align-self: flex-end; }
.wa-time    { font-size: 10px; color: #9e9e9e; text-align: right; margin-top: 2px; }
.wa-input-bar { height: 52px; background: #f0f2f5; padding: 8px 10px;
                display: flex; align-items: center; gap: 8px; }
.wa-input   { flex: 1; height: 36px; border-radius: 20px; background: #fff; border: none;
              padding: 0 14px; font-size: 13px; }
.wa-send-btn{ width: 36px; height: 36px; border-radius: 50%; background: #25d366;
              display: grid; place-items: center; cursor: pointer; }

/* Office Jira board */
.jira-board-layout { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(260px,0.85fr);
                     gap: 12px; min-height: 560px; }
.jira-board-grid   { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; }
.jira-lane         { border-radius: 12px; border: 1px solid rgba(0,0,0,0.06);
                     background: rgba(255,255,255,0.28); display: flex; flex-direction: column; }
.jira-lane-head    { display: flex; justify-content: space-between; padding: 12px;
                     border-bottom: 1px solid rgba(0,0,0,0.06); }
.jira-lane-warn .jira-lane-head { background: linear-gradient(180deg, rgba(255,152,0,0.08), transparent); }
.jira-lane-info .jira-lane-head { background: linear-gradient(180deg, rgba(33,150,243,0.08), transparent); }
.jira-lane-ok   .jira-lane-head { background: linear-gradient(180deg, rgba(76,175,80,0.08), transparent); }
.jira-lane-list  { display: grid; gap: 10px; padding: 12px; overflow-y: auto; }
.jira-card       { width: 100%; display: grid; gap: 10px; padding: 12px; border-radius: 8px;
                   border: 1.5px solid rgba(76,108,82,0.3); background: #fff;
                   text-align: left; cursor: pointer;
                   box-shadow: 0 8px 18px rgba(24,39,29,0.08); }
.jira-card.active{ border-color: rgba(46,125,50,0.7); background: #e8f5e9;
                   box-shadow: 0 0 0 2px rgba(76,175,80,0.25); }
.jira-detail-panel { display: flex; flex-direction: column; padding-left: 20px;
                     border-left: 1px solid rgba(203,230,200,0.34); }
.jira-thread       { display: flex; flex-direction: column; gap: 10px; }
.jira-msg          { padding: 10px 12px; border-radius: 8px; background: rgba(255,255,255,0.5); }
.jira-msg.outgoing { background: rgba(230,244,234,0.7); }
.jira-reply textarea { width: 100%; padding: 8px 10px; border-radius: 8px;
                       border: 1px solid rgba(0,0,0,0.1); resize: vertical; min-height: 56px; }
```

---

## 8. Design Notes (User-Side WhatsApp)

These are intentional choices, not arbitrary styling. Keep them when porting.

- **Authentic WhatsApp palette**: header `#075e54`, send button `#25d366`, outgoing bubble `#dcf8c6`, chat background `#ece5dd`. Users recognize WhatsApp instantly; deviating breaks the "this is WhatsApp" affordance.
- **MOCK badge in titlebar** (orange/amber): regulatory + clarity. Demo-stage only. Do not remove for production-looking demos — it sets honest expectation.
- **Phone-shaped frame** (`#1c1c1e` bezel + rounded screen): visually separates the user's persona from the operator UI. Small but critical — without it the dual-perspective claim is unconvincing.
- **Bubble direction is mirrored on the phone**: `direction="incoming"` (server's POV — message coming INTO the office) renders as an OUTGOING bubble on the phone (because the phone is the user, who SENT it). Office view does not mirror. This is non-obvious; preserve it.
- **Floating, draggable, minimizable**: the phone follows the user as they navigate operational pages, so they can simulate a user message at any time and watch it land in the same screen they were on. Persisting position is intentional UX.
- **Pulsing FAB when collapsed**: subtle attention cue that this is the demo's "magic button". Slow pulse — not a notification dot, not annoying.
- **Lane colors** (warn/info/ok): map to ticket urgency at a glance. New = warn (action required), In Progress = info (in motion), Resolved = ok (done).
- **Card "Start / Resolve / Reopen" button is contextual**: button label changes by current lane. One affordance, three meanings, zero modes.
- **Glassmorphism** (translucent panels with `backdrop-filter`): gives the phone a "floating over the app" feel. If your project's design system is flat/material, replace these surfaces with solid backgrounds — chat fidelity (the phone screen itself) matters more than panel chrome.

---

## 9. Acceptance Tests

Implementation passes when ALL of these hold:

1. User sends message from phone → appears as `incoming` row in inbox with `status: pending`.
2. Operator clicks "Open" on a `New` ticket → status moves to `in_progress`. **No new chat row is created.**
3. Operator types reply and sends → an `outgoing` chat row appears in the thread; ticket status moves to `resolved`; `resolved_at` is stamped.
4. Phone view (refreshed) shows the operator reply for the matching user.
5. Lane counts update after every status transition.
6. Intent side-effect runs: e.g. an `input_request`-class message creates the corresponding domain record and exposes its id in `created_records`.
7. "Resolve without reply" closes the ticket without injecting any chat row.
8. Drag the phone → minimize → reopen → position is preserved within the session.
9. Selecting a different user in the phone clears stale thread state and loads the new user's thread.
10. Two consecutive office replies on the same ticket: the second is a no-op for status (already resolved) but still appends an outgoing chat row.

---

## 10. Common Porting Mistakes

- **Injecting a chat row on "Open"**: status-only — see §2.2.
- **Forgetting to refetch after action**: thread/inbox go stale; UI lies. Always refetch.
- **Mirroring bubble direction wrong**: phone mirrors, office does not. See §8.
- **Mixing user id and ticket id**: office reply takes BOTH (`user_id` + `message_id`); without `message_id`, server falls back to the most recent open ticket — works but is fragile in demos.
- **Hard-coding the example intents verbatim**: the intents in §4.1 are illustrative. Replace with your domain verbs; keep the function shape (text → list of intent strings → primary intent).
- **Skipping the MOCK badge**: stakeholders WILL ask "is this real WhatsApp?". The badge answers before they ask.
- **Wiring agent reply when no agent exists**: in a non-agentic project, just use `auto_reply=true` with canned `response_text`. Simpler, fewer moving parts, demo-equivalent.

---

## 11. File Layout (suggested)

```
backend/
  app.py                         # routes + _simulate_inbound + _office_reply + intents
  (or split into:)
  routes/communication.py
  services/whatsapp_sim.py
  services/intents.py

frontend/src/
  api.js                         # add the four communication.* methods
  App.jsx                        # mount <FloatingUserPhone /> at root
  components/
    phone/FloatingUserPhone.jsx  # §5.2
    office/OfficeConsole.jsx     # §5.3 (mount inside your "Communication" page)
  index.css                      # §7
```

---

## 12. Quick Start Checklist (for the implementing agent)

```
[ ] Decide: agentic flow or non-agentic? (§6)
[ ] Add four endpoints: thread, send, reply, status (§3)
[ ] Implement _infer_intents with project-specific keywords (§4.1)
[ ] Implement _simulate_inbound + _office_reply (§4.2, §4.3)
[ ] Add api.js client methods (§5.1)
[ ] Drop in FloatingUserPhone.jsx, mount at App root (§5.2, §5.4)
[ ] Drop in OfficeConsole.jsx into your communication page (§5.3)
[ ] Paste CSS block (§7)
[ ] Verify all 10 acceptance tests pass (§9)
[ ] If agentic: wire _generate_agent_reply + agent-config endpoint (§6.2)
```

When in doubt, match the contract in §3 and the UI behavior in §9 — internal organization can differ.
