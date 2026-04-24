# FPO_Resume

## Project Overview

Designed, architected, and built a full-stack proof-of-concept for an FPO (Farmer Producer Organization) integrated digital operating platform. The system connects farmer registry, input operations, market linkage, communication, carbon readiness, and agentic automation into a single coherent product -- proving that a unified platform creates more operational value than disconnected agritech point solutions.

**Role:** Full-stack developer and product architect
**Stack:** React + Vite (frontend), Flask + Python (backend), in-memory synthetic data engine
**Codebase:** ~17,000 lines across 7 core files
**Timeline:** April 2026

---

## What I Built

### 1. End-to-End FPO Operating Platform

Built a modular enterprise workflow system covering six integrated domains:

- **Registry** -- FPO directory, farmer profiles, plot records, crop seasons, geography hierarchy
- **Operations** -- demand aggregation, purchase requests, purchase orders, goods receipts, inventory management, input issue to farmers, produce collection, settlement generation
- **Market Linkage** -- mandi price dashboard, buyer registry, buyer demand matching, sales order creation, dispatch management, payment tracking
- **Communication** -- mock WhatsApp simulator with farmer-side phone UI, FPO office receiver queue, live conversation threads, broadcast composer, advisory feed
- **Carbon Readiness** -- climate practice logging, carbon estimation, project aggregation dashboard
- **Governance** -- role-based access control (6 roles), approval workflows, audit logging

Every module shares the same core entities (farmer, plot, crop, FPO) so that writes in one domain propagate correctly across all others.

### 2. Agentic Autonomous Orchestration Layer

Designed and implemented an agent-led operating model that shifts the system from manual workflow tracking to autonomous execution:

- **5 specialist agents** -- Farmer Intake, Input Fulfillment, Crop Cycle, Market Allocation, Human Exception
- **Message-to-execution pipeline** -- a farmer WhatsApp message can trigger demand capture, stock check, procurement, goods receipt, input issue, produce collection, buyer matching, sales order creation, and dispatch -- all autonomously
- **Rule-based trust and confidence scoring** -- configurable thresholds determine when agents proceed vs. escalate to humans
- **Proactive crop-cycle monitoring** -- agents detect approaching harvest windows and send outreach to farmers before they ask
- **Autonomous procurement cycle** -- agents advance open purchase orders through receipt, inventory update, and farmer fulfillment
- **Market allocation cycle** -- agents match unallocated collections to open buyer demands and create sales orders and dispatches
- **Human handoff policy** -- explicit escalation for low-confidence requests, high-value thresholds, disease queries, and missing data
- **Full provenance tracking** -- every agent-created record carries source, source_ref, and created_by_agent metadata so the system distinguishes manual vs. autonomous work

### 3. Agent Command Center

Built a real-time operational control surface as the default landing page:

- Agent performance KPIs and specialist activity breakdown
- Fulfillment queue, harvest watchlist, and market queue
- Human handoff summary panel
- Recent agent runs, alerts, and task logs
- Client-presentation-ready design with plain-language flow stages explaining the agentic model to non-technical audiences
- Drill-down modals for detailed task/exception/alert inspection

### 4. Design System and UI

Created a complete design language from scratch:

- Light glassmorphism aesthetic with green monochromatic palette
- Animated aurora mesh background (10 animated blob layers with GPU-composited drift and breathe animations)
- Three-tier glass intensity system (light, normal, strong)
- Full CSS variable token system for colors, spacing, shadows, and typography
- Framer Motion enter/hover/tap animations with staggered children
- Responsive auto-fill grid layouts
- Custom scrollbar, severity badges, filter pills, stat cards, data tables

### 5. Synthetic Data Engine

Built a deterministic data generation system that produces realistic, scenario-coherent datasets:

- 2 states, 4 districts, 8 FPOs, 1,200-2,000 farmers, 2,500-4,000 plots
- 5 crop clusters (onion, tomato, soybean, cotton, pomegranate)
- Full transaction chains: demands, procurement, inventory, collections, settlements, market activity
- Seed-based regeneration for repeatable demos
- Communication threads, advisory logs, escalation cases, carbon practices

### 6. Cross-Module Data Integrity

Audited and fixed interlink gaps across the entire system:

- Produce collection creates/updates settlements and refreshes market data
- Sales orders update collection status, buyer demand, and governance approvals
- Payment marking triggers settlement releases
- Input issues update demand status and inventory
- Governance approvals now mutate underlying business entities (not just log status)
- All frontend loaders refresh dependent sections after mutations

### 7. Guided Demo Experience

- Step-by-step flow tab: sequential tutorial where completing each step unlocks the next
- Simplified action forms with human-readable dropdowns (no ID memorization)
- Mock WhatsApp tab with farmer-side phone simulation and FPO office reply console

---

## Technical Skills Demonstrated

| Area | Details |
|------|---------|
| **Full-Stack Architecture** | Designed modular API structure (7 blueprint groups, 30+ endpoints) with frontend state management that keeps all domains synchronized |
| **Python / Flask** | 5,000-line backend with REST APIs, rule-based orchestration engine, intent classification, approval workflows, inventory management, synthetic data generation |
| **React / Vite** | Component architecture with section-based rendering, modal systems, data loaders, action handlers, role-based permission enforcement on the client |
| **API Design** | RESTful endpoint design covering CRUD, workflow mutations, aggregation queries, agent orchestration, and admin operations |
| **Agentic System Design** | Built autonomous orchestration with trust scoring, confidence thresholds, specialist routing, human handoff policies, and full provenance tracing |
| **Data Modeling** | 30+ entity types with referential integrity across registry, transactions, market, communication, carbon, and agent metadata |
| **UI/UX Design** | Created complete glassmorphism design system with CSS custom properties, tiered glass surfaces, aurora mesh animation, and motion design |
| **CSS Engineering** | 5,300+ lines of hand-authored CSS including keyframe animations, responsive grids, glass effects, and GPU-optimized compositing |
| **Synthetic Data Generation** | Deterministic scenario-coherent data seeding with configurable seeds for repeatable demonstrations |
| **Intent Classification** | Rule-based NLP simulation classifying farmer messages into actionable intents (input_request, harvest_update, price_query, advisory, disease_query) |
| **Workflow Automation** | Multi-step autonomous pipelines: message -> intent -> scoring -> record creation -> fulfillment -> notification, with configurable human-in-the-loop breakpoints |
| **Cross-Module Integration** | Ensured write propagation across 6 domains with frontend refresh orchestration and backend cascade logic |
| **Audit and Governance** | Role-based access control, approval workflows, audit logging, and agent provenance metadata |

---

## Soft Skills Demonstrated

| Area | Details |
|------|---------|
| **Product Thinking** | Translated a broad agritech thesis document into a focused, demonstrable POC scope. Identified that the strongest proof of value was integrated workflow, not standalone AI features |
| **Systems Thinking** | Designed the platform as interconnected domains rather than isolated screens. Every module shares entities and propagates state changes across the system |
| **Stakeholder Communication** | Built client-presentation-ready command center with plain-language explanations of autonomous behavior for non-technical audiences |
| **Prioritization** | Sequenced build phases (registry -> operations -> market -> communication -> carbon -> polish) to deliver demonstrable value at each stage |
| **Domain Understanding** | Absorbed agricultural value chain concepts: FPO governance, procurement aggregation, mandi pricing, produce collection, buyer matching, carbon readiness, crop-cycle timing |
| **Architecture Decisions** | Chose in-memory synthetic data over database for POC speed. Chose rule-based scoring over fake ML. Layered agent orchestration on existing business entities rather than creating parallel data models |
| **Quality Assurance** | Conducted implementation audits, gap analysis, and interlink testing. Documented findings and remediated systematically |
| **Technical Documentation** | Produced design language spec, development plan, implementation audit, gap reports, agentic flow documentation, and change logs |
| **User Experience Design** | Built guided demo flow for non-technical users. Designed mock WhatsApp with realistic phone UI. Made forms use human-readable labels instead of raw IDs |
| **Scope Management** | Explicitly excluded production integrations (real WhatsApp, satellite, ML models, live APIs) while proving that the workflow and data architecture are production-ready foundations |

---

## Key Metrics

- **6 integrated domains** in a single platform
- **30+ API endpoints** covering full CRUD and workflow operations
- **5 autonomous agents** with trust-based routing and human escalation
- **6 user roles** with permission enforcement on frontend and backend
- **~17,000 lines** of application code
- **30+ data entities** with cross-module referential integrity
- **3 autonomous cycles** (procurement, crop-cycle alerts, market allocation)
- **6 intent types** classified from farmer messages
- **10-layer animated background** with GPU-composited effects

---

## Architecture Highlights

```
Farmer Message (WhatsApp Sim)
    |
    v
Intent Classifier -> Trust Scorer
    |
    +-- High confidence --> Autonomous Execution
    |       |-- Input Fulfillment (stock check -> issue or procure)
    |       |-- Harvest Processing (collection -> buyer match -> dispatch)
    |       |-- Price Query (mandi lookup -> direct reply)
    |       +-- Advisory (crop-cycle context -> response)
    |
    +-- Low confidence --> Human Exception Desk
            |-- Escalation created
            |-- Farmer notified
            +-- Task visible in Command Center
```

```
Orchestration Cycle (triggered or scheduled)
    |
    +-- Procurement Cycle: advance open POs -> receive -> issue to farmers
    +-- Crop-Cycle Alerts: detect harvest windows -> proactive farmer outreach
    +-- Market Allocation: match collections -> create sales orders -> dispatch
```
