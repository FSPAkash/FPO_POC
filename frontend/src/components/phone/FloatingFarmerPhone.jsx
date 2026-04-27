import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api";

function formatTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

const DEFAULT_POSITION = { right: 24, bottom: 24 };

export function FloatingFarmerPhone({ canCommunicate = true, onActivity }) {
  const [open, setOpen] = useState(true);
  const [farmers, setFarmers] = useState([]);
  const [selectedFarmerId, setSelectedFarmerId] = useState("");
  const [thread, setThread] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // drag state: track absolute left/top once user moves; otherwise use default right/bottom
  const [position, setPosition] = useState(null);
  const dragRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api.lookups()
      .then((lookups) => {
        if (cancelled) return;
        const list = lookups?.farmers || [];
        setFarmers(list);
        if (!selectedFarmerId && list[0]?.id) setSelectedFarmerId(list[0].id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadThread = useCallback(async (farmerId) => {
    if (!farmerId) { setThread([]); return; }
    setThreadLoading(true);
    try {
      const payload = await api.communicationThread(farmerId);
      const rows = Array.isArray(payload) ? payload : (payload.items || []);
      const sorted = [...rows].sort((a, b) => {
        const ta = new Date(a.timestamp).getTime();
        const tb = new Date(b.timestamp).getTime();
        if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
        if (ta === tb) {
          return String(a.id || "").localeCompare(String(b.id || ""), undefined, { numeric: true });
        }
        return ta - tb;
      });
      setThread(sorted);
    } catch {
      setThread([]);
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => { loadThread(selectedFarmerId); }, [selectedFarmerId, loadThread]);

  const selectedFarmer = farmers.find((row) => row.id === selectedFarmerId);

  async function submitMessage(event) {
    event.preventDefault();
    if (!text.trim() || !selectedFarmerId || !canCommunicate) return;
    setSending(true);
    try {
      await api.communicationSend({ farmer_id: selectedFarmerId, text: text.trim(), auto_reply: false });
      setText("");
      await loadThread(selectedFarmerId);
      onActivity?.();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  function onPointerDown(event) {
    if (event.target.closest("button, select, input, a, form")) return;
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    event.target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragRef.current) return;
    const { offsetX, offsetY, width, height } = dragRef.current;
    const nextLeft = Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - offsetX));
    const nextTop = Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - offsetY));
    setPosition({ left: nextLeft, top: nextTop });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  const style = open && position
    ? { left: position.left, top: position.top, right: "auto", bottom: "auto" }
    : { right: DEFAULT_POSITION.right, bottom: DEFAULT_POSITION.bottom, left: "auto", top: "auto" };

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
              <span className="floating-phone-title">Farmer WhatsApp</span>
            </div>
            <button
              type="button"
              className="floating-phone-close"
              onClick={() => { setOpen(false); setPosition(null); }}
              aria-label="Minimize phone"
              title="Minimize"
            >
              &ndash;
            </button>
          </div>

          <label className="floating-phone-farmer">
            <span>Farmer</span>
            <select
              value={selectedFarmerId}
              onChange={(event) => setSelectedFarmerId(event.target.value)}
            >
              {farmers.map((row) => (
                <option key={row.id} value={row.id}>{row.name} - {row.village}</option>
              ))}
            </select>
          </label>

          <div className="phone-frame floating-phone-frame">
            <div className="phone-screen">
              <div className="wa-header">
                <div className="wa-avatar" />
                <div>
                  <div className="wa-name">FPO Help Desk</div>
                  <div className="wa-status">{selectedFarmer?.name || "No farmer selected"}</div>
                </div>
              </div>
              <div className="wa-thread">
                {threadLoading ? <p className="wa-queue-empty">Loading thread...</p> : null}
                {!threadLoading && !thread.length ? <p className="wa-queue-empty">No messages yet for this farmer.</p> : null}
                {thread.slice(-18).map((row) => (
                  <div key={row.id} className={`wa-bubble ${row.direction === "incoming" ? "outgoing" : "incoming"}`}>
                    <div>{row.text}</div>
                    <div className="wa-time">{formatTime(row.timestamp)}</div>
                  </div>
                ))}
              </div>
              <form className="wa-input-bar" onSubmit={submitMessage}>
                <input
                  className="wa-input"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Type farmer message..."
                />
                <button type="submit" className="wa-send-btn" disabled={sending || !canCommunicate || !selectedFarmerId || !text.trim()}>
                  <span>{">"}</span>
                </button>
              </form>
            </div>
          </div>

          <div className="floating-phone-scenarios">
            <button type="button" className="btn-ghost btn-small" onClick={() => setText(`Need 5 bags urea for ${selectedFarmer?.primary_crop || "crop"}.`)}>Input</button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setText(`What is today's mandi rate for ${selectedFarmer?.primary_crop || "crop"}...`)}>Price</button>
            <button type="button" className="btn-ghost btn-small" onClick={() => setText(`Leaves on my ${selectedFarmer?.primary_crop || "crop"} are yellow.`)}>Disease</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="floating-phone-fab"
          onClick={() => setOpen(true)}
          aria-label="Open mock farmer phone"
          title="Open mock farmer phone"
        >
          <span className="floating-phone-fab-icon" aria-hidden="true">WA</span>
          <span className="floating-phone-fab-label">Farmer phone</span>
        </button>
      )}
    </div>
  );
}
