export const GLOBAL_KB = {
  product: {
    name: "FPO Agentic Platform",
    pitch:
      "Agent-first operating system for Farmer Producer Organisations. Agents aggregate demand, run procurement, execute market sales, and handle farmer WhatsApp — humans only approve exceptions.",
    personas: [
      "FPO Admin / CEO — runs the org, approves exceptions",
      "Operations User — procurement, inventory, settlements",
      "Sales User — buyer demand, sales orders, dispatch",
      "Field Coordinator — farmer onboarding + collections",
      "Viewer — read-only (auditor, lender, board)"
    ],
    differentiators: [
      "Everything is agent-driven by default; humans only step in on approvals.",
      "Role switcher + data profile switcher let you demo any persona on synthetic data.",
      "Mock farmer WhatsApp phone (bottom-right) shows end-to-end two-way farmer flow."
    ]
  },
  demoTips: [
    "Start on Command — it shows the agent cycle and KPIs. 'This is what the FPO CEO sees at 8am.'",
    "Use the role dropdown (top bar) to switch personas live and show permission changes.",
    "Reseed with Full Data for a rich dataset; Agentic Work for a quieter, agent-only view.",
    "Open the mock farmer phone (bottom-right) and send Input / Price / Disease — the agent replies on-screen.",
    "Always close with Governance — prove every action is logged and auditable."
  ]
};

export const SECTION_KB = {
  command: {
    title: "Agent Command Center",
    oneLiner: "Live cockpit — what the agents did, what humans still owe.",
    purpose:
      "Real-time view of the agentic work cycle: demand aggregation, procurement, dispatch, farmer comms, and pending human approvals.",
    keyActions: [
      "Run Agent Cycle — triggers a full autonomous pass (demand → PR → GRN → match → dispatch → WhatsApp).",
      "Open pending approvals from the queue widget.",
      "Jump to any downstream section via the nav tabs."
    ],
    talkingPoints: [
      "'This is the first screen the FPO CEO sees every morning.'",
      "'Green = agent-done, Amber = agent asking a human, Red = blocked.'",
      "'One button — Run Cycle — simulates an 8-hour day of back-office work in 3 seconds.'"
    ],
    faqs: [
      {
        q: "What does Run Agent Cycle actually do?",
        a: "Walks the full pipeline on synthetic data: aggregates farmer demand, raises POs, receives inputs, matches buyers, creates sales orders, dispatches, and fires WhatsApp updates. Everything it does shows up in the other tabs."
      },
      {
        q: "Is this real data?",
        a: "Synthetic but deterministic — seed 42, 'Full Data' profile. Change seed/profile in the top bar to regenerate."
      },
      {
        q: "Can it run without humans?",
        a: "Yes for the happy path. Exceptions (over-threshold PR, new buyer, disputed weight) stop at Approvals for a human."
      }
    ]
  },
  walkthrough: {
    title: "Agentic Flow Walkthrough",
    oneLiner: "Guided step-by-step demo narrative.",
    purpose: "Scripted storyboard for the end-to-end agent flow — use this to anchor a first-time demo.",
    keyActions: [
      "Play the steps in order; each one highlights what changes in the other tabs.",
      "Use as a prompt if a buyer wants the full narrative before diving into detail."
    ],
    talkingPoints: [
      "'If you want the 3-minute version, this is it.'",
      "'Each step maps to a real operational SOP for an FPO.'"
    ],
    faqs: [
      {
        q: "Should I always start here?",
        a: "For a non-technical buyer, yes. For an ops-savvy audience, start on Command and jump to specific tabs."
      }
    ]
  },
  registry: {
    title: "Farmer Network",
    oneLiner: "Master data — farmers, plots, seasons, geographies.",
    purpose:
      "Single source of truth for farmer membership, plots (crops, acreage), seasons, and communication profiles (language, opt-in channel).",
    keyActions: [
      "Create Farmer — add new member, auto-linked to WhatsApp profile.",
      "Browse plots by FPO / village / crop.",
      "View communication profile to show multilingual support."
    ],
    talkingPoints: [
      "'This is not just a CRM — every row is an input to agent decisions.'",
      "'Language + channel here drives exactly how the agent talks to this farmer.'"
    ],
    faqs: [
      {
        q: "Where does this data come from in production?",
        a: "Onboarding via field coordinator app, bulk upload, or integration with the FPO's existing ERP."
      },
      {
        q: "Multiple crops per farmer?",
        a: "Yes — one farmer, many plots, each plot has its own crop/season."
      }
    ]
  },
  operations: {
    title: "Agent Fulfillment",
    oneLiner: "Procurement, inventory, produce collections, settlements.",
    purpose:
      "Back-office execution layer. Agents aggregate farmer demand into POs, track goods receipts, issue inputs, record produce collection, and generate farmer settlements.",
    keyActions: [
      "Aggregate Demands — roll individual farmer needs into one PR per input.",
      "Approve PR — one-click or bulk.",
      "Create Goods Receipt — inventory in.",
      "Issue Inputs — inventory out to a farmer.",
      "Record Collection — produce in from a farmer.",
      "Generate Settlements — calculate farmer payouts.",
      "Mark Settlement Paid — release funds (or bulk mark paid)."
    ],
    talkingPoints: [
      "'The agent wrote every one of these rows. The human only clicks Approve.'",
      "'Bulk-approve is the killer feature — 200 POs in one click.'",
      "'Settlements include commodity rate + deductions for inputs issued — all automatic.'"
    ],
    faqs: [
      {
        q: "Why is the review queue separate from the main demand list?",
        a: "Review queue = agent-generated rows that crossed a policy threshold (amount, new supplier, odd quantity). Everything else auto-posts."
      },
      {
        q: "Can I edit before approving?",
        a: "Yes — the approve screen lets the human adjust quantity/price, and the override is logged in Governance."
      },
      {
        q: "How does settlement math work?",
        a: "Collected qty × mandi-linked rate − (inputs issued on credit) − deductions. Shown per farmer, per season."
      }
    ]
  },
  market: {
    title: "Market Execution",
    oneLiner: "Buyer demand, matching, sales orders, dispatch.",
    purpose:
      "Forward-side of the FPO. Agents match aggregated produce to buyer demand, create sales orders, plan dispatch, and mark buyer payments.",
    keyActions: [
      "Create Buyer Demand — new buyer ask.",
      "Matching view — agent's proposed farmer-to-buyer allocation.",
      "Create Sales Order — commit the match.",
      "Create Dispatch — schedule truck.",
      "Mark Sales Paid — buyer payment received."
    ],
    talkingPoints: [
      "'This is where the FPO makes its margin — and where agents kill the biggest operational cost: matching.'",
      "'Matching optimises for price realisation first, then logistics distance.'",
      "'Dispatch ties directly to the GRN from Fulfillment — no double-counting.'"
    ],
    faqs: [
      {
        q: "How does the matching engine pick farmers?",
        a: "Scores by price realisation, quality grade, pickup distance, and farmer settlement history. Buyer side: priority + SLA."
      },
      {
        q: "What if a buyer rejects quality?",
        a: "Returns create a reverse GRN; settlement recalculates automatically and the event hits the audit log."
      },
      {
        q: "Is mandi rate live?",
        a: "Demo uses synthetic prices; in prod it pipes in from eNAM / Agmarknet feeds the buyer pre-agreed."
      }
    ]
  },
  whatsapp: {
    title: "Human Handoff Desk",
    oneLiner: "All farmer chats the agent escalated to a human.",
    purpose:
      "Inbox of tickets where the WhatsApp agent decided it needs a human — low confidence, off-policy, or the farmer explicitly asked.",
    keyActions: [
      "Open a thread, see full agent + farmer history.",
      "Office Reply — send as FPO staff.",
      "Agent Reply — let the agent try again with human context.",
      "Set Status — in_progress / resolved."
    ],
    talkingPoints: [
      "'Agent handles ~80% of farmer messages without a human touch.'",
      "'Every escalation carries the reason — you never read a thread cold.'",
      "'Status + assignee give the FPO a real ticketing system, not just chaos in a phone.'"
    ],
    faqs: [
      {
        q: "How does the agent decide to escalate?",
        a: "Confidence score + policy rules (price commitments, complaints, disease cases). Config lives in the Campaigns tab."
      },
      {
        q: "Does the farmer know it's a bot?",
        a: "Configurable per FPO. Most keep a single 'FPO Help Desk' persona."
      },
      {
        q: "Languages?",
        a: "Hindi, Marathi, Kannada, Tamil, Telugu, English in the demo. Add more via the language model config."
      }
    ]
  },
  communication: {
    title: "Campaigns & Outreach",
    oneLiner: "Broadcasts, advisories, and the WhatsApp agent's config.",
    purpose:
      "Outbound side — the agent sends weather alerts, advisories, disease case follow-ups, and broadcasts. Also houses agent tuning.",
    keyActions: [
      "Create Broadcast — target by crop / village / season.",
      "Simulate read — mark a farmer as having read a broadcast.",
      "Assign Disease Case — route to the right agronomist.",
      "Edit Agent Config — persona, tone, escalation thresholds."
    ],
    talkingPoints: [
      "'Targeting uses the same farmer registry data — no separate audience builder.'",
      "'Read-receipt loop is two-way: we know which farmers saw it and which ignored it.'",
      "'Agent config is prompt-free for the FPO user — they pick intents and thresholds.'"
    ],
    faqs: [
      {
        q: "Templates vs free text?",
        a: "Broadcasts use WhatsApp-approved templates; agent replies are free-form (with the FPO's persona pinned)."
      },
      {
        q: "Can we A/B?",
        a: "Yes — broadcast variants split across the target list. Read-rate reports back here."
      }
    ]
  },
  governance: {
    title: "Approvals & Audit",
    oneLiner: "Every agent action, every human decision — logged.",
    purpose:
      "Approvals queue + immutable audit trail. This is the trust layer — lenders, auditors, and the FPO board all live here.",
    keyActions: [
      "Decide Approval — approve/reject with note.",
      "Bulk decide — sweep a queue.",
      "Filter audit log by actor, entity, or time."
    ],
    talkingPoints: [
      "'If the CFO asks who approved PO-4812 at 2am — this is how you answer in 3 seconds.'",
      "'Every agent action names the agent, the policy invoked, and the human who could have overridden it.'",
      "'Export goes straight to the lender's due-diligence pack.'"
    ],
    faqs: [
      {
        q: "Can audit logs be edited?",
        a: "No — append-only. Corrections are separate entries referencing the original."
      },
      {
        q: "Role separation?",
        a: "Yes — approver cannot be creator. Enforced by the Approvals service, not the UI."
      }
    ]
  },
  carbon: {
    title: "Carbon Readiness",
    oneLiner: "Sustainable practices + carbon project prep.",
    purpose:
      "Track farmer-level carbon practices (SRI, DSR, cover crops), estimate sequestration, and stage projects for registry submission.",
    keyActions: [
      "Log Carbon Practice — per farmer / plot / season.",
      "Advance Carbon Project — move through registry stages.",
      "Review Estimates — tCO2e per plot."
    ],
    talkingPoints: [
      "'Carbon is a second revenue line for the FPO on top of produce.'",
      "'Data is captured in the same workflow as procurement — zero extra field-work.'",
      "'Registry stage gates are built in — no surprise audits.'"
    ],
    faqs: [
      {
        q: "Which registries?",
        a: "Verra and Gold Standard structure in the demo. Schema is generic enough to plug others."
      },
      {
        q: "How is sequestration estimated?",
        a: "Practice factors × plot area × season — calibrated per crop. Replaced by MRV-grade readings in production."
      }
    ]
  }
};

export function buildAnswer({ question, section, role, canAction }) {
  const q = (question || "").toLowerCase().trim();
  if (!q) {
    return {
      title: "Ask me anything",
      body:
        "Try: 'what does this page do', 'how does matching work', 'who can approve PRs', 'why did the agent escalate'."
    };
  }

  const sec = SECTION_KB[section] || SECTION_KB.command;

  const matches = [];
  for (const [secId, kb] of Object.entries(SECTION_KB)) {
    for (const faq of kb.faqs || []) {
      const hay = (faq.q + " " + faq.a).toLowerCase();
      const score = scoreMatch(q, hay);
      if (score > 0) matches.push({ score, secId, faq });
    }
  }
  matches.sort((a, b) => b.score - a.score);

  if (matches[0] && matches[0].score >= 2) {
    const top = matches[0];
    const crossPage = top.secId !== section;
    return {
      title: top.faq.q,
      body: top.faq.a + (crossPage ? `  [from ${SECTION_KB[top.secId].title}]` : ""),
      related: matches.slice(1, 4).map((m) => m.faq.q)
    };
  }

  if (/what.*(this|page|screen|tab).*do|what.*looking at|explain.*page/.test(q)) {
    return {
      title: sec.title,
      body: `${sec.oneLiner}\n\n${sec.purpose}`,
      related: sec.faqs?.slice(0, 3).map((f) => f.q) || []
    };
  }

  if (/talking point|pitch|how (do|should) i (say|pitch|explain)|say to (customer|buyer|client)/.test(q)) {
    return {
      title: `Talking points — ${sec.title}`,
      body: sec.talkingPoints.map((t) => "• " + t).join("\n"),
      related: sec.faqs?.slice(0, 3).map((f) => f.q) || []
    };
  }

  if (/permission|role|who can|can.*(role|user|admin|viewer)/.test(q)) {
    const actionList = role && canAction ? describeRolePerms(role, canAction) : null;
    return {
      title: `Role: ${role || "current"}`,
      body: actionList || "Use the role switcher in the top bar to preview each persona's permissions live.",
      related: ["What personas does the product support?"]
    };
  }

  if (/reseed|reset|seed|data profile|fresh data/.test(q)) {
    return {
      title: "Reset the demo",
      body:
        "Top bar → set seed (default 42) + profile (Full Data or Agentic Work) → Reseed. Click Reset Demo to wipe agent runs and queues without changing the seed."
    };
  }

  if (/agent cycle|run cycle|autonomous/.test(q)) {
    return {
      title: "Run Agent Cycle",
      body: SECTION_KB.command.faqs[0].a
    };
  }

  if (/differentiat|why (us|you)|vs|competitor|better than/.test(q)) {
    return {
      title: "Why us",
      body: GLOBAL_KB.product.differentiators.map((t) => "• " + t).join("\n")
    };
  }

  if (/persona|who.*use|user.*type/.test(q)) {
    return {
      title: "Personas",
      body: GLOBAL_KB.product.personas.map((t) => "• " + t).join("\n")
    };
  }

  return {
    title: `${sec.title} — here's what I know`,
    body: `${sec.oneLiner}\n\nKey actions on this page:\n${(sec.keyActions || []).map((t) => "• " + t).join("\n")}`,
    related: sec.faqs?.slice(0, 3).map((f) => f.q) || []
  };
}

function scoreMatch(query, hay) {
  const tokens = query.split(/\s+/).filter((t) => t.length > 2);
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }
  return score;
}

function describeRolePerms(role, canAction) {
  const buckets = [
    ["Create farmers", "create_farmer"],
    ["Create purchase requests", "create_pr"],
    ["Approve POs", "approve_pr"],
    ["Goods receipts", "create_grn"],
    ["Aggregate demands", "aggregate_demands"],
    ["Issue inputs", "issue_inputs"],
    ["Record collection", "record_collection"],
    ["Generate settlements", "generate_settlements"],
    ["Release settlements", "release_settlement"],
    ["Buyer demand", "create_buyer_demand"],
    ["Sales orders", "create_sales_order"],
    ["Dispatch", "create_dispatch"],
    ["Mark sales paid", "mark_sales_paid"],
    ["Decide approvals", "decide_approvals"],
    ["Communicate", "communicate"],
    ["Carbon", "manage_carbon"],
    ["Export reports", "export_reports"],
    ["Reseed demo", "reseed"],
    ["Run agent cycle", "run_demo"]
  ];
  const yes = [];
  const no = [];
  for (const [label, key] of buckets) {
    if (canAction(key)) yes.push(label);
    else no.push(label);
  }
  return `CAN: ${yes.join(", ") || "—"}\n\nCANNOT: ${no.join(", ") || "—"}`;
}
