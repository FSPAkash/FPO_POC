# FPO POC Gap Audit

## Audit basis

This audit compares the implemented app against:

- `understanding.md`
- `dev-plan.md`
- `The current agritech ecosystem shows that most platforms solve only one part of the agricultural value chain.docx`

I also reviewed the current implementation in:

- `backend/app.py`
- `backend/data_seed.py`
- `frontend/src/App.jsx`
- `frontend/src/theme.js`
- `frontend/src/api.js`
- `frontend/src/components/layout/AppShell.jsx`

I additionally verified the current build state by:

- running Flask test-client smoke checks on core endpoints
- running `python -m compileall backend`
- running `npm run build` in `frontend`

## Executive summary

The current app is a credible **demo shell**, not yet a credible **FPO operating system POC** in the sense described by the source documents.

What it already proves well:

- synthetic data can power a convincing visual demo
- the product direction is correctly FPO-first, not farmer-app-first
- mock WhatsApp can be used as a communication simulator
- basic procurement actions exist
- basic buyer demand creation exists
- carbon readiness can be shown as a summary layer

What is still missing from the intended POC:

- a true end-to-end operating flow from registry -> demand -> procurement -> inventory issue -> collection -> sale -> settlement
- role-based usage, approvals, governance, and auditable visibility
- persistent master data and transactions
- deeper registry management
- real operations linkage between records
- market order lifecycle beyond buyer demand creation
- carbon workflow beyond summary tables
- reporting, exports, and traceability
- implementation structure that can scale beyond a demo

The biggest issue is not that features are absent individually. The biggest issue is that the app still behaves like a set of seeded module views rather than one connected operational system.

## Current strengths

These are worth preserving:

1. The product thesis is correct.
   The app is clearly oriented around FPO workflows rather than a generic farmer advisory app.

2. Synthetic data quality is good enough for a POC.
   `backend/data_seed.py` creates believable volumes across farmers, plots, demands, procurement, collections, market prices, messages, and carbon practices.

3. The communication simulation is the most differentiated part of the current POC.
   The mock WhatsApp workspace is much closer to a usable demo than most other modules.

4. There are real backend actions, not just static UI.
   Farmer creation, purchase request creation, PR approval, goods receipt creation, settlement payment, buyer demand creation, and communication actions all work.

5. The app builds and the backend routes respond.
   So we are not starting from a broken base.

## Coverage summary

| Area | Target from docs | Current state | Assessment |
| --- | --- | --- | --- |
| Registry foundation | FPO, farmer, plot, season, geography, communication profile, CRUD, role views | Mostly seeded read views, only farmer create is interactive | Partial |
| Communication | WhatsApp simulation, advisory, escalation, broadcast, multilingual-ready | Strong mock chat; weak advisory workflow; no broadcast management | Partial |
| Operations | demand -> PR -> PO -> GRN -> inventory -> issue -> collection -> settlement | PR/PO/GRN exist; issue, collection, and settlement chain are not operationally linked | Partial |
| Market | price dashboard, buyer registry, demand board, matching, sales order, dispatch | price + buyers + demand creation + matching exist; sales lifecycle is mostly seeded only | Partial |
| Carbon | practice capture, estimate engine, project aggregation, project progression | read-only practice/project summary plus one demo status change | Partial |
| Governance | roles, login, approvals, audit, transparency | almost entirely missing | Missing |
| Reports | KPI reports, operational reports, exports | KPI summary only | Missing |
| Architecture | modular APIs, persistence, validation, scalable frontend structure | single-process in-memory demo architecture | Missing for anything beyond demo |

## Most important misses

### 1. The best demo flow is implemented but not reachable in the app navigation

There is an `ExecutionFlowSection` and a `RegistrySection` in `frontend/src/App.jsx`, but `frontend/src/theme.js` only exposes:

- `whatsapp`
- `dashboard`
- `operations`
- `communication`
- `market`
- `carbon`
- `reports`

So the user cannot navigate to:

- `execution`
- `registry`

This is a major POC miss because:

- the README promises a step-by-step flow
- registry is a foundational module in every planning document
- the most coherent end-to-end demo path is effectively hidden

### How to implement

Frontend:

- add `execution` and `registry` to `NAV_ITEMS`
- make `execution` the first tab for demos
- expose the registry as a first-class module, not hidden logic

Product:

- make the demo start from registry and not from WhatsApp
- use `execution` as the 10-minute sponsor walkthrough

Priority: `P0`

---

### 2. The app is not yet a true connected operating workflow

The documents require a story like:

1. farmer/member exists
2. demand is captured
3. FPO aggregates demand
4. procurement is raised
5. goods are received
6. stock is issued
7. produce is collected
8. buyer is matched
9. sale is dispatched
10. farmer settlement is completed

Today, those records mostly exist as parallel seeded datasets.

Examples:

- creating a purchase request does not tie back to specific demand rows
- approving a PR creates a PO, but no demand state transitions happen
- goods receipt updates inventory, but there is no input-issue action from stock to farmer
- produce collection is read-only
- sales orders are read-only
- settlement payment can be marked paid, but settlement is not linked to a generated sale outcome in the UI flow

This means the app demonstrates modules, but not the full enterprise workflow promised in the docs.

### How to implement

Backend:

- add explicit state transitions:
  - `input_demands`: `captured -> aggregated -> procured -> issued`
  - `produce_collections`: `captured -> graded -> allocated_to_order -> settled`
  - `sales_orders`: `draft -> confirmed -> dispatched -> delivered -> paid`
- link PR creation to selected demand rows
- link goods receipt to issueable inventory lots
- add `POST /api/operations/input-issues`
- add `POST /api/operations/produce-collections`
- add `POST /api/market/sales-orders`
- add `POST /api/market/dispatches`
- auto-generate settlement suggestions from collection + sale data

Frontend:

- build task-driven screens instead of summary-only tables
- add action panels for:
  - aggregate captured demands
  - issue stock to farmers
  - record produce collection
  - convert a match into a sales order
  - dispatch and close buyer payment
- add record drilldowns showing upstream and downstream links

Data model:

- add relation fields such as:
  - `input_demand_ids` on purchase requests
  - `issue_ids` on demand records
  - `collection_ids` on sales orders
  - `sales_order_id` on settlements when sale-based

Priority: `P0`

---

### 3. Governance, role-based access, and approvals are largely missing

All three documents explicitly treat governance as critical. The current POC does not actually demonstrate:

- login
- role-specific views
- role-based permissions
- approval routing beyond PR approval
- approval history
- audit visibility
- member transparency

Current situation:

- no authentication flow
- no user entity in the running app
- no role switcher
- no approval logs UI
- audit logs exist in memory but are not exposed as a product feature

### How to implement

Backend:

- add a lightweight POC auth model:
  - `users`
  - `roles`
  - `user_fpo_access`
- add session-based or token-based mock login
- add role-aware response filtering
- add generic `approval_logs`
- add `GET /api/admin/audit-logs`
- add approval events for:
  - farmer onboarding approval
  - purchase request approval
  - large inventory issue approval
  - settlement release approval
  - sales order approval above threshold

Frontend:

- add a role switcher in the top bar for demo mode:
  - Super Admin
  - FPO Admin
  - Field Coordinator
  - Operations User
  - Sales User
  - Viewer
- hide or disable actions by role
- add approval queue and audit timeline widgets

Priority: `P0`

---

### 4. The app has no persistence, so it is not yet proving operational discipline

The current backend uses a global in-memory dataset:

- `DATASET = generate_dataset(seed=42)` in `backend/app.py`
- reseed replaces the entire runtime state

This is acceptable for a visual demo, but not enough for the POC described in `dev-plan.md`, which calls for a real data layer even if SQLite-based.

Why this matters:

- no restart durability
- no concurrent-user confidence
- no credible audit or approval trail
- no realistic migrations
- no repeatable transaction history outside seed generation

### How to implement

Phase 1 persistence:

- adopt SQLite with SQLAlchemy
- move seed generation into table inserts
- keep `POST /api/admin/seed` but make it a database reset/reseed tool

Suggested first persisted tables:

- geographies
- fpos
- farmers
- plots
- crop_seasons
- communication_profiles
- input_demands
- purchase_requests
- purchase_orders
- goods_receipts
- inventory_transactions
- produce_collections
- settlements
- buyers
- buyer_demands
- sales_orders
- dispatches
- carbon_practices
- carbon_projects
- approval_logs
- audit_logs

Priority: `P0`

## Module-by-module deep audit

### A. Registry foundation

#### What the docs expect

- geography hierarchy
- FPO directory
- farmer master data
- plot boundaries / mapability
- crop seasons
- communication profiles
- role-aware CRUD
- field-data readiness for later layers

#### What exists now

- seeded states, districts, villages, FPOs, farmers, plots, seasons, communication profiles
- read APIs for FPOs, farmers, plots, seasons
- one create action for farmers
- farmer creation also creates a communication profile, plot, and season

#### What is missing

1. Registry is not accessible from navigation.
2. No FPO create/update flow.
3. No farmer detail page.
4. No farmer update flow.
5. No plot create/update/edit flow.
6. No crop season create/update flow.
7. No communication profile UI.
8. No geography hierarchy UI.
9. No map or polygon visualization.
10. No onboarding approval state.
11. Missing important master fields from the planning docs:
    - registration number
    - office location
    - bank details
    - gender
    - age
    - consent/data ownership fields
12. Seasons are loaded but not actually rendered beyond a count.

#### Why it matters

The documents treat registry as the foundation layer. Right now it is a supporting table view, not the core of the product.

#### How to implement

Backend:

- add FPO CRUD
- add farmer update endpoint
- add plot CRUD
- add season CRUD
- add communication profile endpoints
- add geography browse endpoints

Frontend:

- add registry navigation
- split registry into subviews:
  - FPOs
  - Farmers
  - Plots
  - Seasons
  - Communication profiles
- add detail drawers/pages for:
  - farmer
  - plot
  - season
- render plot polygon or a simplified GeoJSON preview

Priority: `P1`

---

### B. Communication and advisory

#### What the docs expect

- WhatsApp-first interaction layer
- query routing
- advisory delivery
- demand capture
- escalation
- broadcast campaigns
- multilingual readiness
- image/disease pathway
- human-in-loop routing

#### What exists now

- strong mock WhatsApp UI
- intent inference for a few query types
- message status changes
- office reply flow
- advisory log
- escalation queue
- disease case seeding
- input request capture from chat

#### What is missing

1. No broadcast composer or campaign management.
2. No targeted messaging by crop/village/FPO.
3. No template management.
4. No image upload workflow.
5. No disease case review screen.
6. No field officer assignment workflow beyond seeded owner/status.
7. No multilingual switch, translation, or voice simulation in UI.
8. No weather or crop-calendar integration layer, even simulated.
9. No communication analytics:
   - response SLA
   - unresolved cases
   - campaign acknowledgement rate
10. No link from a message to its resulting operational record in the UI.

#### Why it matters

Communication is the best current module, but it still behaves like a simulator more than an operating inbox.

#### How to implement

Backend:

- add `broadcasts`
- add `broadcast_recipients`
- add `message_threads`
- add `case_assignments`
- add `POST /api/communication/broadcasts`
- add `GET /api/communication/disease-cases`
- add `POST /api/communication/disease-cases/<id>/assign`

Frontend:

- add broadcast composer with filters:
  - crop
  - village
  - FPO
  - language
- add case detail panel showing:
  - original message
  - any attached image
  - suggested issue
  - assigned owner
  - next action
- add links from chat-created demand to the demand record

Priority: `P1`

---

### C. Operations engine

#### What the docs expect

- demand aggregation
- purchase request
- purchase order
- goods receipt
- inventory ledger
- farmer input issue
- produce collection
- settlement summary
- workflow approvals
- audit logs

#### What exists now

- demand list
- purchase request creation
- PR approval creates PO
- goods receipt creation
- inventory snapshot
- settlement list and mark-paid action
- seeded produce collections

#### What is missing

1. No actual demand aggregation workflow screen.
2. No link between specific demand rows and the PR created.
3. No farmer input issue action flow.
4. No inventory ledger view even though transactions exist in data.
5. No goods receipt history table in the UI.
6. No produce collection entry flow.
7. No quality/grading workflow.
8. No warehouse/location model beyond simple fields.
9. No settlement generation logic exposed to the user.
10. No operational exception handling:
    - damaged stock review
    - partial receipt
    - stock mismatch
    - rejected collection
11. No approval beyond PR approval.
12. No audit trail view.

#### Important hidden gap

The Operations UI loads collections from the API but does not render them as an operator workflow. This means an intended core POC capability is still passive.

#### How to implement

Backend:

- add `POST /api/operations/demands/aggregate`
- add `POST /api/operations/input-issues`
- add `GET /api/operations/inventory-transactions`
- add `POST /api/operations/produce-collections`
- add `POST /api/operations/settlements/generate`

Frontend:

- add demand aggregation action panel
- add inventory ledger table
- add goods receipt history table
- add produce collection form with:
  - farmer
  - crop
  - quantity
  - grade
  - moisture
  - collection center
- add issue-input action from inventory to farmer
- add settlement traceability view showing:
  - collection
  - rate
  - deductions
  - status

Priority: `P0`

---

### D. Market linkage workspace

#### What the docs expect

- mandi price dashboard
- buyer registry
- buyer demand board
- supply-demand matching
- sales order workflow
- dispatch tracking
- payment tracking
- revenue comparison logic

#### What exists now

- price list
- buyer list
- buyer demand creation
- matching engine
- sales orders endpoint exists

#### What is missing

1. Buyer demands are counted but not rendered as a first-class board.
2. Sales orders are loaded but not rendered in the Market UI.
3. No dispatch UI.
4. No payment tracking UI for buyers.
5. No manual deal conversion from match -> sales order.
6. No quality-grade-aware matching.
7. No geography/logistics-aware matching.
8. No buyer reliability/terms weighting in the recommendation.
9. No market comparison logic in UI:
   - mandi vs buyer
   - sell now vs hold
10. No order/invoice lifecycle.

#### Why it matters

The planning docs say market linkage is one of the strongest commercial proof points. Right now we show intelligence-lite, but not commerce execution.

#### How to implement

Backend:

- add `POST /api/market/sales-orders`
- add `POST /api/market/dispatches`
- add `POST /api/market/sales-orders/<id>/mark-paid`
- extend matching to use:
  - crop
  - quantity
  - district proximity
  - quality grade
  - buyer reliability
  - payment terms

Frontend:

- add Buyer Demand Board
- add Sales Orders table
- add Dispatch table
- add "Create Deal from Match" action
- add price comparison card:
  - local mandi average
  - buyer offer
  - estimated uplift

Priority: `P0`

---

### E. Carbon readiness workspace

#### What the docs expect

- practice logging
- carbon estimate engine
- project aggregation
- project progression
- readiness logic built on earlier data
- later path to verification and revenue allocation

#### What exists now

- seeded practices
- seeded estimates
- seeded projects
- project status table
- a demo step can advance one project status

#### What is missing

1. No create/edit carbon practice flow.
2. No explanation of how credits were estimated.
3. No evidence trail from farmer -> practice -> estimate -> project.
4. No project detail view.
5. No verification package simulation.
6. No farmer participation view.
7. No revenue allocation logic.
8. No linkage to plot history or activity discipline.
9. No readiness scoring.

#### Why it matters

The documents are explicit that carbon should be the later layer built on clean operational data. The current UI shows the output layer, not the dependency chain.

#### How to implement

Backend:

- add `POST /api/carbon/practices`
- add `GET /api/carbon/estimates`
- add `GET /api/carbon/projects/<id>`
- add `POST /api/carbon/projects/<id>/advance`
- add readiness scoring fields:
  - plot coverage %
  - practice completeness %
  - farmer participation %
  - verification readiness

Frontend:

- add practice logging form
- add project detail drawer:
  - area
  - farmers
  - practices
  - credits
  - revenue
  - current stage
- add a "why this project is carbon-ready" breakdown

Priority: `P1`

---

### F. Reporting and traceability

#### What the docs expect

- dashboards and reports
- exportable reports
- operational traceability
- decision support outputs

#### What exists now

- dashboard summary
- KPI report with a few headline metrics

#### What is missing

1. No exports.
2. No traceability reports.
3. No buyer performance report.
4. No supplier performance report.
5. No inventory movement report.
6. No settlement ageing report.
7. No campaign/advisory effectiveness report.
8. No carbon readiness report.
9. No audit report.

#### How to implement

Backend:

- add report endpoints for CSV/JSON export
- add report aggregations:
  - input demand by village
  - procurement status
  - inventory movement
  - produce collection summary
  - pending settlements
  - buyer fulfillment
  - supplier lead time
  - carbon readiness

Frontend:

- add report selector with export buttons
- add drilldowns from KPI cards to report tables

Priority: `P1`

## UX and demo misses

### 1. Hidden modules weaken the demo story

The most important demo screens are not in navigation.

### 2. Several loaded datasets are not actually shown

Examples:

- seasons are loaded but not shown in registry
- collections are loaded but not rendered as an operator workflow
- buyer demands are not shown as a board
- sales orders are loaded but not shown in market

### 3. The app is still table-first, not workflow-first

The planning docs emphasize operational credibility. Many sections still feel like admin snapshots instead of task execution workspaces.

### 4. Operations forms still use raw IDs in places

That is fine for internal development, but it is weak for a sponsor/demo audience.

### 5. There is no role-switch demo mode

For a POC, a role switcher would dramatically improve the credibility of approvals, permissions, and workflow separation.

## Technical architecture misses

### 1. Frontend is too centralized

`frontend/src/App.jsx` holds nearly the entire application flow, state, and rendering logic.

What this causes:

- high change risk
- difficult testing
- hard-to-maintain cross-module state
- weak module ownership

### Recommended implementation

- split into route-level pages or section containers
- move shared data fetching into module hooks
- move forms into focused components
- introduce module folders:
  - `registry`
  - `operations`
  - `market`
  - `communication`
  - `carbon`
  - `reports`

Priority: `P1`

---

### 2. Backend is too monolithic

`backend/app.py` mixes:

- routing
- business logic
- record mutation
- audit creation
- demo orchestration

### Recommended implementation

- split by blueprint/service:
  - `registry`
  - `communication`
  - `operations`
  - `market`
  - `carbon`
  - `reports`
  - `admin`
- move mutation logic to service functions
- add schema validation

Priority: `P1`

---

### 3. No validation layer or test suite

There are some route-level checks, but no formal request/response schema layer and no committed tests around business logic.

### Recommended implementation

- add Pydantic or Marshmallow schemas
- add backend tests for:
  - farmer onboarding
  - demand aggregation
  - PR approval
  - goods receipt inventory math
  - issue stock validation
  - matching engine
  - settlement status changes
- add frontend smoke tests for key workflows

Priority: `P2`

## What we should build next

## Phase 1: Make the current POC coherent

Goal:
Turn the existing pieces into one believable end-to-end demo.

Build:

- expose `execution` and `registry` in nav
- make registry first-class
- add demand aggregation action
- add input issue action
- add produce collection action
- add buyer demand board
- add sales order creation from match
- render sales orders and dispatches
- show audit history and approval queue

Outcome:
The app now tells one complete FPO story.

Priority: `Immediate`

## Phase 2: Add governance and persistence

Goal:
Make the POC feel like an operating system, not a simulation screen set.

Build:

- SQLite + SQLAlchemy
- user/role model
- approval logs
- audit log API and UI
- role-based demo mode

Outcome:
The POC now proves operational discipline and governance.

Priority: `Immediate after Phase 1`

## Phase 3: Deepen commerce and carbon

Goal:
Strengthen the two monetization narratives from the documents.

Build:

- sales order + dispatch + buyer payment workflow
- buyer comparison and uplift recommendation
- carbon practice logging
- carbon readiness score
- project detail and evidence summary

Outcome:
The POC becomes commercially persuasive, not just operationally plausible.

Priority: `Next`

## Phase 4: Add reporting and polish

Goal:
Make the POC sponsor-ready and easier to evaluate.

Build:

- exports
- operational reports
- KPI drilldowns
- role-based walkthrough mode
- seed scenario presets
- better demo script tied to real workflow data

Outcome:
The app becomes a polished review artifact.

Priority: `After core workflow closure`

## Recommended implementation order

1. Expose hidden `registry` and `execution` sections.
2. Add missing operational links: demand aggregation, input issue, produce collection.
3. Add market execution: demand board, sales order, dispatch, buyer payment.
4. Add audit and approval UI.
5. Move data to SQLite and introduce roles.
6. Add carbon action workflows and readiness logic.
7. Add reports and exports.

## Final assessment

If we judge the app as a **visual concept demo**, it is already good.

If we judge it against the written POC scope, the main things we missed are:

- operational connectedness
- governance
- persistence
- accessible registry foundation
- market execution depth
- carbon workflow depth
- reporting and traceability

So the right next step is not to add more isolated screens.

The right next step is to make the existing modules behave like one operating system with:

- shared entities
- visible state transitions
- role-based approvals
- durable records
- clear traceability from communication to operations to market to settlement
