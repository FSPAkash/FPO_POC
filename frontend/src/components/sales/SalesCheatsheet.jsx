import { useEffect, useMemo, useRef, useState } from "react";
import { SECTION_KB, GLOBAL_KB, buildAnswer } from "./cheatsheetKnowledge";

const STORAGE_OPEN_KEY = "fpo_cheatsheet_open";

export function SalesCheatsheet({ section, role, canAction }) {
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [tab, setTab] = useState("page");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState([]);
  const [thinking, setThinking] = useState(false);
  const threadRef = useRef(null);

  const kb = SECTION_KB[section] || SECTION_KB.command;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_OPEN_KEY, open ? "1" : "0");
    } catch {
      // ignore
    }
  }, [open]);

  useEffect(() => {
    setTab("page");
  }, [section]);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [history, thinking, tab]);

  const suggested = useMemo(() => {
    return (kb.faqs || []).slice(0, 4).map((f) => f.q);
  }, [kb]);

  function ask(rawQuestion) {
    const q = (rawQuestion || "").trim();
    if (!q) return;
    setTab("ask");
    setHistory((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setThinking(true);
    window.setTimeout(() => {
      const answer = buildAnswer({ question: q, section, role, canAction });
      setHistory((prev) => [...prev, { role: "agent", ...answer }]);
      setThinking(false);
    }, 240);
  }

  function onSubmit(event) {
    event.preventDefault();
    ask(question);
  }

  function clearChat() {
    setHistory([]);
  }

  return (
    <div className={`cheatsheet ${open ? "open" : "collapsed"}`}>
      {open ? (
        <div className="cheatsheet-panel" role="dialog" aria-label="Sales cheatsheet">
          <header className="cheatsheet-header">
            <div className="cheatsheet-header-info">
              <span className="cheatsheet-badge">DEMO COACH</span>
              <div className="cheatsheet-heading">
                <strong>{kb.title}</strong>
                <span className="cheatsheet-subtitle">{kb.oneLiner}</span>
              </div>
            </div>
            <button
              type="button"
              className="cheatsheet-close"
              onClick={() => setOpen(false)}
              aria-label="Close cheatsheet"
              title="Minimize"
            >
              &ndash;
            </button>
          </header>

          <nav className="cheatsheet-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={`cheatsheet-tab ${tab === "page" ? "active" : ""}`}
              aria-selected={tab === "page"}
              onClick={() => setTab("page")}
            >
              This page
            </button>
            <button
              type="button"
              role="tab"
              className={`cheatsheet-tab ${tab === "ask" ? "active" : ""}`}
              aria-selected={tab === "ask"}
              onClick={() => setTab("ask")}
            >
              Ask agent
            </button>
            <button
              type="button"
              role="tab"
              className={`cheatsheet-tab ${tab === "pitch" ? "active" : ""}`}
              aria-selected={tab === "pitch"}
              onClick={() => setTab("pitch")}
            >
              Pitch
            </button>
          </nav>

          {tab === "page" ? (
            <div className="cheatsheet-body">
              <Section title="Purpose">
                <p>{kb.purpose}</p>
              </Section>
              <Section title="Key actions">
                <ul className="cheatsheet-list">
                  {(kb.keyActions || []).map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </Section>
              <Section title="Talking points">
                <ul className="cheatsheet-list">
                  {(kb.talkingPoints || []).map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </Section>
              <Section title="Likely questions">
                <div className="cheatsheet-chips">
                  {(kb.faqs || []).map((faq) => (
                    <button
                      key={faq.q}
                      type="button"
                      className="cheatsheet-chip"
                      onClick={() => ask(faq.q)}
                    >
                      {faq.q}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          ) : null}

          {tab === "ask" ? (
            <div className="cheatsheet-body cheatsheet-chat">
              <div className="cheatsheet-thread" ref={threadRef}>
                {!history.length ? (
                  <div className="cheatsheet-empty">
                    <p>Ask anything about the current page or the product.</p>
                    <div className="cheatsheet-chips">
                      {suggested.map((q) => (
                        <button
                          key={q}
                          type="button"
                          className="cheatsheet-chip"
                          onClick={() => ask(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {history.map((msg, idx) => (
                  <div key={idx} className={`cheatsheet-msg cheatsheet-msg-${msg.role}`}>
                    {msg.role === "user" ? (
                      <div className="cheatsheet-msg-text">{msg.text}</div>
                    ) : (
                      <div className="cheatsheet-msg-card">
                        <div className="cheatsheet-msg-title">{msg.title}</div>
                        <div className="cheatsheet-msg-text">{msg.body}</div>
                        {msg.related && msg.related.length ? (
                          <div className="cheatsheet-chips cheatsheet-chips-tight">
                            {msg.related.map((r) => (
                              <button
                                key={r}
                                type="button"
                                className="cheatsheet-chip"
                                onClick={() => ask(r)}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
                {thinking ? <div className="cheatsheet-typing">Thinking...</div> : null}
              </div>
              <form className="cheatsheet-input-bar" onSubmit={onSubmit}>
                <input
                  className="cheatsheet-input"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={`Ask about ${kb.title}...`}
                />
                <button type="submit" className="cheatsheet-send" disabled={!question.trim()}>
                  Ask
                </button>
                {history.length ? (
                  <button type="button" className="cheatsheet-clear" onClick={clearChat} title="Clear chat">
                    Clear
                  </button>
                ) : null}
              </form>
              <div className="cheatsheet-footnote">
                Context: <strong>{kb.title}</strong> · Role: <strong>{role || "—"}</strong>
              </div>
            </div>
          ) : null}

          {tab === "pitch" ? (
            <div className="cheatsheet-body">
              <Section title={GLOBAL_KB.product.name}>
                <p>{GLOBAL_KB.product.pitch}</p>
              </Section>
              <Section title="Personas">
                <ul className="cheatsheet-list">
                  {GLOBAL_KB.product.personas.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </Section>
              <Section title="Differentiators">
                <ul className="cheatsheet-list">
                  {GLOBAL_KB.product.differentiators.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </Section>
              <Section title="Demo flow tips">
                <ul className="cheatsheet-list">
                  {GLOBAL_KB.demoTips.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </Section>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="cheatsheet-fab"
          onClick={() => setOpen(true)}
          aria-label="Open sales cheatsheet"
          title="Sales cheatsheet"
        >
          <span className="cheatsheet-fab-icon" aria-hidden="true">i</span>
          <span className="cheatsheet-fab-label">Demo coach</span>
        </button>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="cheatsheet-section">
      <h4 className="cheatsheet-section-title">{title}</h4>
      {children}
    </section>
  );
}
