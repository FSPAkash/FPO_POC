# Agentic Flow Implementation

## Purpose
This document explains the agent-led operating model implemented for the FPO system, the technical changes made across backend and frontend, and the exact end-to-end runtime flow now supported by the app.

The target operating model is:

- Farmers should be handled end to end by agents wherever confidence is high and business rules permit.
- The FPO office should come in only when the system has low confidence, when there is an escalation, or when a workflow crosses an approval boundary.
- Input demand handling, procurement creation, stock issue, crop-cycle follow-up, harvest verification, market allocation, and dispatch creation should all be agent-driven.
- Carbon remains a separate tab and is intentionally not interlinked into the autonomous workflow layer.

## Business Intent Implemented
The implementation shifts the app from a mostly manual workflow tracker into an agent-orchestrated operating system.

The system now supports these principles:

- A farmer message can directly create downstream records.
- The system can decide whether to issue stock, procure more stock, or escalate.
- The system can proactively message farmers about upcoming harvest readiness based on crop seasons.
- A harvest-ready update can directly move into collection, market allocation, and dispatch planning.
- Human review is now concentrated in one place instead of being the default action path.

## Files Changed
- `backend/app.py`
- `frontend/src/api.js`
- `frontend/src/App.jsx`
- `frontend/src/sectionViews.jsx`
- `frontend/src/theme.js`

## High-Level Architecture
The implementation keeps the existing dataset and operational record model intact, then layers an autonomous orchestration system on top of those same records.

This was important because the app already had:

- input demand records
- purchase requests
- purchase orders
- goods receipts
- inventory
- input issue records
- produce collections
- settlements
- buyer demands
- sales orders
- dispatches
- approvals
- communication threads
- escalations

Instead of creating a second automation-only data model, the autonomous layer now writes into those same entities so every tab stays consistent.

## Backend Design

### 1. New Agent-Orchestration Metadata
The backend dataset in `backend/app.py` was extended with new agent-trace tables:

- `agent_runs`
- `agent_tasks`
- `agent_alerts`
- `harvest_signals`

These give the system operational memory and visibility:

- `agent_runs` records each orchestration cycle or message-led autonomous execution.
- `agent_tasks` stores what a specific agent did or what it handed off.
- `agent_alerts` tracks proactive outbound nudges, especially crop-cycle and harvest reminders.
- `harvest_signals` stores structured harvest-readiness detections coming from farmer messages.

### 2. Existing Business Records Now Carry Agent Provenance
The autonomous layer needed traceability without introducing duplicate record types, so several existing records now carry origin metadata:

- `source`
- `source_ref`
- `created_by_agent`

This provenance was added or normalized across:

- purchase requests
- purchase orders
- goods receipts
- farmer input issues
- produce collections
- sales orders
- dispatches

This allows the UI and audit layer to distinguish:

- manual office-created records
- agent-created records
- records linked to a specific upstream message or run

### 3. New Control Constants and Policy Thresholds
The autonomous layer is rule-based and explicit about when agents can proceed versus when humans must be involved.

Key thresholds added in `backend/app.py`:

- `INPUT_AUTONOMY_TRUST_THRESHOLD`
- `HARVEST_AUTONOMY_CONFIDENCE_THRESHOLD`
- `PR_AUTO_APPROVAL_QTY`
- `PR_AUTO_APPROVAL_VALUE`
- `INPUT_ISSUE_APPROVAL_QTY`
- `SALES_ORDER_APPROVAL_QTY`
- `HARVEST_OUTREACH_WINDOW_DAYS`
- `HARVEST_OVERDUE_GRACE_DAYS`
- `AGENT_ALERT_COOLDOWN_DAYS`

These constants define:

- when a farmer input request is trusted enough to be actioned automatically
- when harvest intent is strong enough to proceed without office confirmation
- when procurement or sales volume crosses into human approval territory
- when proactive crop-cycle alerts should be sent
- how often the same farmer can be nudged without spam

### 4. Agent Profiles
A specialist-agent model was introduced conceptually and operationally.

The system now tracks these agent roles:

- `Farmer Intake Agent`
- `Input Fulfillment Agent`
- `Crop Cycle Agent`
- `Market Allocation Agent`
- `Human Exception Agent`

This does not spin up separate backend processes. Instead, it creates role-specific orchestration paths and trace logs so the UI can show specialist behavior cleanly.

### 5. New Helper Families

#### Run and Task Tracking
The following helper layer was added to track autonomous activity:

- `_start_agent_run(...)`
- `_finish_agent_run(...)`
- `_record_agent_task(...)`
- `_record_agent_alert(...)`
- `_latest_agent_alert(...)`

These helpers make the system observable and power the new command-center tab.

#### Date and Parsing Utilities
To support proactive crop-cycle logic, the backend added:

- `_parse_date(...)`
- `_days_until(...)`
- `_days_since(...)`

This allows the orchestration layer to evaluate season timing, alert cooldowns, and collection recency.

#### Inventory and Procurement Helpers
To allow agent-led fulfillment through the same business entities already used by the app, the following helpers were added:

- `_best_supplier_for_item(...)`
- `_should_auto_approve_pr(...)`
- `_create_agent_purchase_request(...)`
- `_create_agent_goods_receipt(...)`
- `_create_agent_input_issue(...)`

These functions allow the system to:

- select a supplier
- raise a PR autonomously
- decide if that PR still needs approval
- receive stock into inventory
- issue stock directly to the farmer when stock is available

#### Harvest and Market Helpers
For crop-cycle and sales automation, the following helpers were added:

- `_estimated_harvest_qty_qtl(...)`
- `_score_harvest_signal(...)`
- `_latest_collection_for_farmer_crop(...)`
- `_best_open_buyer_demand(...)`
- `_open_quantity_for_buyer_demand(...)`
- `_create_agent_collection(...)`
- `_create_agent_sales_order(...)`
- `_create_agent_dispatch(...)`

These functions allow the system to:

- estimate a reasonable harvest quantity from the farmer profile and crop
- decide whether a harvest message is strong enough to trust
- create a produce collection automatically
- find a suitable open buyer demand
- create a sales order from available collections
- raise a dispatch if no approval is required

#### Human Handoff Helper
One explicit handoff function was added:

- `_handoff_to_human(...)`

This centralizes all “agent stops here” behavior so that:

- the farmer gets a clear reply
- an escalation is opened
- a human task is created
- the ticket remains visible in the exception layer

## Intent Model Changes

### New Intent Added
The message intent classifier was extended with:

- `harvest_update`

The classifier now distinguishes:

- `price_query`
- `input_request`
- `disease_query`
- `harvest_update`
- `advisory`
- `broadcast_ack`

This matters because harvest messages are no longer treated as generic advisory text. They now unlock downstream operational automation.

## Communication-to-Execution Flow

### Farmer Message Entry Point
The existing mock WhatsApp endpoint remains the front door:

- `POST /api/communication/mock-whatsapp/send`

That endpoint already created a message record and thread entry. The implementation now makes that communication path the beginning of autonomous execution.

### Input Request Flow
When a farmer sends a high-confidence request such as:

- `Need 3 bags urea for my crop`

the runtime flow is:

1. `_simulate_whatsapp(...)` classifies the intent as `input_request`.
2. `_score_input_demand(...)` parses item, quantity, and crop context.
3. A structured input-demand record is created.
4. If trust is below threshold, the demand is marked `needs_review`.
5. The send endpoint calls `_generate_agent_reply(...)`.
6. `_handle_input_request_agentically(...)` takes over.
7. If stock exists, the agent creates an input issue immediately.
8. If stock does not exist, the agent groups compatible demands and raises an autonomous PR.
9. If the PR crosses approval limits, the flow is handed to the office.
10. The farmer is replied to with the resulting execution state.

Possible outcomes:

- direct stock issue
- procurement started automatically
- human review required due to confidence
- human approval required due to value or quantity

### Harvest Update Flow
When a farmer sends a message such as:

- `My crop is harvest ready now`

the runtime flow is:

1. `_simulate_whatsapp(...)` classifies the intent as `harvest_update`.
2. `_score_harvest_signal(...)` scores the message using keywords, crop context, and season timing.
3. A structured `harvest_signal` record is created.
4. `_generate_agent_reply(...)` routes the message to `_handle_harvest_update_agentically(...)`.
5. If confidence is high enough, the system creates a produce collection.
6. It then looks for the best available buyer demand for that crop.
7. If a buyer is available, it creates a sales order.
8. If approval is not required, it creates a dispatch immediately.
9. If approval is required, the system hands off to the office with a clear pending-approval state.
10. The farmer is messaged with the status of verification, allocation, and dispatch planning.

Possible outcomes:

- collection created and market allocation pending
- collection created and sales order created
- collection created and dispatch created
- handoff due to low confidence
- handoff due to approval threshold

### Price Query Flow
For price queries, the new flow answers directly from the latest crop market snapshot without routing the office by default.

The system:

- detects crop context
- fetches the latest matching mandi snapshot
- replies directly to the farmer
- creates an agent task for traceability

If no market snapshot exists, the query is handed off instead of hallucinated.

### Advisory Flow
For advisory queries, the agent now uses:

- crop reference data
- active season timing
- expected harvest timing

It responds with a concise crop-cycle and next-step reply without escalating unless the broader communication agent still marks it uncertain.

## Autonomous Orchestration Cycle

### New Cycle API
Two new agent APIs were added:

- `GET /api/agent/command-center`
- `POST /api/agent/run-cycle`

These support the live control surface in the frontend.

### What the Cycle Does
`_run_agent_orchestration_cycle(...)` is the backend coordinator for non-message-triggered work.

It currently runs three sub-cycles:

- `_run_autonomous_procurement_cycle(...)`
- `_run_crop_cycle_alerts(...)`
- `_run_market_allocation_cycle(...)`

### Autonomous Procurement Cycle
This cycle advances fulfillment work that is already in motion.

It can:

- receive open agent-created purchase orders into goods receipts
- update inventory
- find pending demand rows that are now serviceable from stock
- issue inputs automatically to farmers once stock becomes available

This closes the loop after the initial request so procurement does not stop at PR creation.

### Crop-Cycle Alert Cycle
This cycle watches crop seasons and proactively engages farmers.

It checks:

- expected harvest dates
- whether a collection has already happened recently
- whether a recent alert has already been sent

If the season is close to harvest and no recent collection exists, the agent sends a proactive harvest-check message and records an alert.

This turns the system from reactive to proactive.

### Market Allocation Cycle
This cycle watches unallocated produce collections.

It can:

- find the best current buyer demand for the collection’s crop
- create an agent sales order
- create a dispatch if approval is not required
- notify the farmer of the allocation or pending-approval state

This is the main bridge from collection operations into market execution.

## Command Center Payload
`_agent_command_center_payload(...)` builds the new top-level operations overview.

It exposes:

- summary KPIs
- specialist-agent activity
- fulfillment queue
- harvest watchlist
- market queue
- human handoffs
- recent runs
- recent alerts
- recent tasks

This is intentionally not a vanity dashboard. It is the live autonomous work surface.

## Frontend Changes

### 1. Navigation Reworked Around Agent-Led Flow
`frontend/src/theme.js` was updated to reflect the actual runtime flow instead of the old department structure.

The new top-level order is:

- `Command`
- `Farmer Network`
- `Fulfillment`
- `Market Exec`
- `Exception Desk`
- `Campaigns`
- `Approvals`
- `Carbon`

This matches the new intent:

- command center first
- master data second
- execution tabs next
- human-exception handling separated out
- governance retained as an explicit approval and audit surface
- carbon kept separate

### 2. New Default Landing Tab
In `frontend/src/App.jsx`, the default active section now starts on:

- `command`

This makes the autonomous command center the first screen users see.

### 3. New Frontend Loader and Action
`frontend/src/App.jsx` was extended with:

- a `command` loader using `api.agentCommandCenter()`
- a new action using `api.runAgentCycle(...)`

This means the UI can:

- display the autonomous operating state
- trigger the orchestration cycle manually
- refresh the relevant sections after autonomous execution

### 4. New Command Center View
`frontend/src/sectionViews.jsx` now includes:

- `CommandCenterSection`

This screen shows:

- agent performance summary
- human handoffs
- fulfillment queue
- crop-cycle watchlist
- market queue
- recent agent runs
- recent alerts
- recent agent tasks

The section reuses the existing UI primitives:

- `StatCard`
- `TableCard`
- `DataTable`

This keeps the design consistent with the rest of the app while still shifting the operating model.

### 5. Farmer Chat Reframed as Human Exception Desk
The former farmer-ticket surface remains technically useful, but it is now conceptually repositioned.

The old chat board is now the place for:

- escalations
- low-confidence requests
- disease cases
- approval-blocked conversations

This matches the intended model where the office only steps in when autonomous handling is insufficient.

## How Existing Tabs Behave Now

### Command
The new real-time operating surface for the autonomous system.

### Farmer Network
Still the system of record for:

- farmers
- plots
- crop seasons
- communication preferences

The agent layer depends on this data directly for crop-cycle and outreach logic.

### Fulfillment
Still uses the same operational entities, but now many of those records can originate from agents instead of only from manual action.

This tab will now reflect:

- auto-captured demands
- autonomous procurement
- autonomous goods receipt
- autonomous input issue
- autonomous collection creation

### Market Exec
Still uses the same market entities, but now they can be generated from crop-cycle and harvest flows.

This tab will now reflect:

- agent-created sales orders
- agent-created dispatches
- collections allocated automatically

### Exception Desk
This is where manual involvement should be concentrated.

### Campaigns
Broadcasts and communication flows remain intact, but now sit beside the autonomous workflow rather than being the primary driver of work.

### Approvals
Still controls high-value or high-risk decisions.

The autonomous layer now deliberately routes certain decisions here instead of bypassing governance.

## Approval and Handoff Policy
The agent system was not implemented as “agents do everything no matter what.” It was implemented as “agents do everything they responsibly can.”

Human handoffs are intentionally triggered by:

- low input-request confidence
- low harvest-readiness confidence
- disease and escalation flows
- procurement that exceeds autonomous thresholds
- sales allocation that exceeds autonomous thresholds
- missing data needed for a safe decision

This keeps the system aligned with the business requirement:

- autonomous first
- human only by exception

## Data Integrity Strategy
One of the core implementation goals was keeping all tabs interlinked.

The changes preserve that by ensuring autonomous operations mutate the same data used elsewhere:

- procurement updates demand status
- goods receipt updates inventory
- issue updates demand rows and farmer communications
- collection updates settlement suggestions
- sales order updates collections and buyer-demand status
- dispatch updates sales-order execution status
- approvals can release downstream effects on agent-created records

This is why the system remains coherent after autonomous actions.

## Runtime Examples

### Example 1: Urea Request With High Trust
Farmer says:

- `Need 3 bags urea for my crop`

System behavior:

1. detect `input_request`
2. score item and quantity confidence
3. create input demand
4. check current stock
5. if stock is present, create input issue
6. if stock is absent, raise procurement
7. if procurement is below approval threshold, continue autonomously
8. message farmer with status

### Example 2: Harvest Readiness
Farmer says:

- `My crop is harvest ready now`

System behavior:

1. detect `harvest_update`
2. score confidence against crop season timing
3. create harvest signal
4. create collection record
5. find best open buyer demand
6. create sales order
7. create dispatch if approval is not needed
8. message farmer with outcome

### Example 3: Crop-Cycle Proactive Alert
System sees:

- expected harvest is near
- no recent collection exists
- no recent reminder was sent

System behavior:

1. create proactive harvest-check alert
2. send farmer outreach message
3. log alert and task in agent telemetry

## Testing and Verification Performed
The implementation was verified with:

- backend Python compile check for `backend/app.py`
- frontend production build using `npm run build`
- backend smoke test covering:
- `GET /api/agent/command-center`
- `POST /api/agent/run-cycle`
- farmer input request through the chat endpoint
- farmer harvest update through the chat endpoint

The smoke tests confirmed:

- command-center payload loads
- cycle API runs
- input-request messages return agent results
- harvest-update messages return agent results

## Current Limitations
The system is substantially more autonomous than before, but it is still a synthetic demo app and there are deliberate simplifications.

Current limitations include:

- supplier selection is heuristic and not contract-aware
- harvest quantity estimation is rule-based, not yield-model-driven
- dispatch generation is immediate and simplified
- buyer matching uses the existing demo matching logic rather than a negotiation engine
- proactive alerts run through manual cycle triggering rather than a background scheduler daemon
- real-world delivery confirmation and logistics exceptions are not deeply modeled yet

## Recommended Next Enhancements
If this evolves further, the next high-value additions would be:

- scheduled background execution for the orchestration cycle
- richer farmer trust and profile scoring
- approval policies by value, crop, geography, and user role
- dispatch delivery confirmation loop
- settlement release automation after payment receipt
- stronger market-allocation optimization across multiple collections and buyers
- more explicit farmer-facing status timelines in the UI

## Summary
The implementation does not just add an “AI reply” layer. It changes the app into an autonomous operating flow.

What was achieved:

- farmer communication now creates business execution
- fulfillment can progress autonomously
- crop-cycle monitoring can trigger proactive outreach
- harvest updates can flow into collection and market execution
- approvals and exceptions are explicit instead of being the default path
- the frontend now starts with an agent command center instead of a removed dashboard

In short, the system now behaves much more like an agentic FPO operating platform rather than a manual workflow demo with chat attached.
