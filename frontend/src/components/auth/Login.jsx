import { useState } from "react";
import companyIcon from "../../../logos/FSSML.png";
import stomaLogo from "../../../logos/stoma.png";

const CREDENTIALS = {
  Akash: "a1234",
  Naina: "n1234"
};

const VIEW_W = 360;
const VIEW_H = 120;
const CENTER = { x: VIEW_W / 2, y: VIEW_H / 2 };

// asymmetric scatter across wide canvas — xy in viewBox coords, no symmetry
const AGENTS = [
  { short: "Intake",      color: "#388E3C", x:  40, y:  38, size: 5 },
  { short: "Fulfillment", color: "#4CAF50", x: 118, y:  22, size: 6 },
  { short: "Crop",        color: "#FFA726", x: 238, y:  92, size: 4.5 },
  { short: "Market",      color: "#1B5E20", x: 322, y:  48, size: 6.5 },
  { short: "Handoff",     color: "#EF5350", x:  74, y:  96, size: 4 }
];

function polar(agent) {
  return { x: agent.x, y: agent.y };
}

export function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const expected = CREDENTIALS[username.trim()];
    if (expected && expected === password) {
      onLogin({ username: username.trim() });
    } else {
      setError("Invalid username or password.");
      setBusy(false);
    }
  }

  const positions = AGENTS.map(polar);

  // directional flows: each describes a conversation with a staggered cadence
  // outbound: hub -> agent; inbound: agent -> hub; peer: agent -> agent (curved)
  const flows = [
    { kind: "out",  from: "hub", to: 0, delay: 0.0, duration: 2.6 },
    { kind: "in",   from: 0,     to: "hub", delay: 1.3, duration: 2.4 },
    { kind: "peer", from: 0,     to: 1, delay: 0.6, duration: 3.0, curve: -22 },
    { kind: "out",  from: "hub", to: 1, delay: 1.1, duration: 2.8 },
    { kind: "peer", from: 1,     to: 2, delay: 1.9, duration: 3.2, curve: 18 },
    { kind: "peer", from: 2,     to: 3, delay: 2.4, duration: 3.4, curve: -14 },
    { kind: "in",   from: 3,     to: "hub", delay: 3.0, duration: 2.6 },
    { kind: "peer", from: 1,     to: 3, delay: 2.0, duration: 3.8, curve: 28 },
    { kind: "peer", from: 3,     to: 4, delay: 3.6, duration: 3.0, curve: -20 },
    { kind: "out",  from: "hub", to: 4, delay: 0.8, duration: 2.2 },
    { kind: "peer", from: 4,     to: 0, delay: 4.2, duration: 3.4, curve: 16 },
    { kind: "peer", from: 2,     to: 4, delay: 4.8, duration: 3.6, curve: -24 }
  ];

  function resolve(ref) {
    return ref === "hub" ? CENTER : positions[ref];
  }

  function flowColor(flow) {
    if (flow.from === "hub") return AGENTS[flow.to].color;
    if (flow.to === "hub")   return AGENTS[flow.from].color;
    return AGENTS[flow.from].color;
  }

  function curvedPath(a, b, curve) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = mx + nx * curve;
    const cy = my + ny * curve;
    return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  }

  return (
    <div className="login-root">
      <div className="login-bg-orb login-bg-orb-a" aria-hidden="true" />
      <div className="login-bg-orb login-bg-orb-b" aria-hidden="true" />
      <div className="login-card">
        <div className="login-hero" aria-hidden="true">
          <svg className="login-mesh" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="meshGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#4CAF50" stopOpacity="0.18" />
                <stop offset="70%" stopColor="#4CAF50" stopOpacity="0" />
              </radialGradient>
              {AGENTS.map((agent, i) => (
                <radialGradient key={agent.short} id={`dotGlow-${i}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={agent.color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={agent.color} stopOpacity="0" />
                </radialGradient>
              ))}
            </defs>

            <ellipse cx={CENTER.x} cy={CENTER.y} rx="160" ry="70" fill="url(#meshGlow)" />

            {flows.map((flow, i) => {
              const a = resolve(flow.from);
              const b = resolve(flow.to);
              const curve = flow.kind === "peer" ? flow.curve : 0;
              const d = curvedPath(a, b, curve);
              return (
                <path
                  key={`track-${i}`}
                  d={d}
                  fill="none"
                  stroke={flowColor(flow)}
                  strokeOpacity={flow.kind === "peer" ? 0.08 : 0.14}
                  strokeWidth="0.8"
                  strokeLinecap="round"
                />
              );
            })}

            {flows.map((flow, i) => {
              const a = resolve(flow.from);
              const b = resolve(flow.to);
              const curve = flow.kind === "peer" ? flow.curve : 0;
              const d = curvedPath(a, b, curve);
              const color = flowColor(flow);
              return (
                <g key={`pulse-${i}`}>
                  <circle r={flow.kind === "peer" ? 1.8 : 2.4} fill={color} opacity="0">
                    <animateMotion dur={`${flow.duration}s`} begin={`${flow.delay}s`} repeatCount="indefinite" path={d} />
                    <animate attributeName="opacity"
                      values="0;0;1;1;0"
                      keyTimes="0;0.05;0.15;0.85;1"
                      dur={`${flow.duration}s`}
                      begin={`${flow.delay}s`}
                      repeatCount="indefinite" />
                  </circle>
                </g>
              );
            })}

            {positions.map((pos, i) => (
              <g key={`node-${i}`} className="login-node" style={{ animationDelay: `${i * 0.1 + 0.15}s` }}>
                <circle cx={pos.x} cy={pos.y} r={AGENTS[i].size * 2.2} fill={`url(#dotGlow-${i})`} />
                <circle
                  cx={pos.x} cy={pos.y} r={AGENTS[i].size}
                  fill="#fff" stroke={AGENTS[i].color} strokeWidth="1.8"
                  className="login-node-dot"
                  style={{ color: AGENTS[i].color, animationDelay: `${i * 0.45}s` }}
                />
              </g>
            ))}
          </svg>
          <div className="login-orbit-core">
            <img src={stomaLogo} alt="" className="login-orbit-logo" />
          </div>
        </div>
        <div className="login-header">
          <h1 className="login-title">FPO Integrated OS</h1>
          <p className="login-subtitle">Five agents. One command center.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Enter username"
              required
              autoFocus
            />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter password"
              required
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" className="btn-primary login-submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="login-footer">
          <img src={companyIcon} alt="FSSML" className="login-footer-icon" />
          <span>powered by Findability Sciences</span>
        </div>
      </div>
    </div>
  );
}
