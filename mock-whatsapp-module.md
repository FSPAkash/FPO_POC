# Mock WhatsApp Module

## Purpose
This document defines how the mock WhatsApp module is expected to work in the POC, how we should continue developing it, and how it directly ties back to:

- `understanding.md`
- `dev-plan.md`

The module is intentionally a simulation layer for the POC. It is not a production WhatsApp integration.

## Why This Module Exists
In `understanding.md`, a core thesis is that the platform should be operationally useful for FPOs and not just a farmer-facing app. Communication is one of the critical operating layers because it feeds:

- demand capture
- advisory delivery
- escalation routing
- trust and adoption

In `dev-plan.md`, this corresponds to:

- Module B: Communication and Advisory Simulator
- intent capture
- message logs
- escalation handling
- integration with operations workflows

This module is the visible implementation of that layer.

## User Perspectives
The mock WhatsApp experience must support two perspectives in one module:

1. Farmer-side phone experience
2. FPO office receiver experience

Both perspectives must use the same conversation data so users can clearly see that one side impacts the other.

## Scope for POC
### In scope
- realistic phone-like farmer chat UI
- call-center style office queue
- message status lifecycle (`pending`, `in_progress`, `resolved`)
- office reply mapped to selected farmer and selected ticket
- automatic side effects for key intents (for example input demand capture)

### Out of scope
- Meta WhatsApp Business API integration
- message template governance
- real delivery receipts
- media file upload pipeline
- production identity verification

## UX Model
## Farmer View (Phone UI)
- user selects a farmer identity for simulation
- farmer sends message in phone composer
- message appears in conversation as `incoming`
- farmer sees office replies in same thread

## Office View (Call Center UI)
Three queue columns:

- `New`: unpicked tickets (`pending`)
- `In Progress`: opened tickets being handled (`in_progress`)
- `Resolved`: replied/closed tickets (`resolved`)

Office flow:

1. Click `Open` on a ticket
2. Ticket is selected and farmer context is selected
3. If ticket was `New`, it moves to `In Progress`
4. Office writes reply and sends
5. Ticket moves to `Resolved`
6. Reply appears in farmer phone thread

## Message Status Lifecycle
Status transitions for a ticketed inbound message:

1. `pending` (new inbound message)
2. `in_progress` (opened by office)
3. `resolved` (office reply sent)

Important rule:

- `Open` should not create synthetic chat noise. It should only select and update status.

## Intent Handling in POC
Incoming farmer message text is mapped to intent by simple heuristic parsing:

- `price_query`
- `input_request`
- `advisory`
- `disease_query`
- `broadcast_ack`

Side effects:

- `input_request`: creates `input_demand` record
- `advisory`: creates advisory log
- `disease_query`: creates disease case and escalation
- `price_query`: returns latest synthetic price response

## Backend APIs
### Thread and messaging
- `GET /api/communication/mock-whatsapp/thread`
- `POST /api/communication/mock-whatsapp/send`
- `POST /api/communication/mock-whatsapp/reply`

### Ticket state
- `POST /api/communication/messages/<message_id>/status`

### Supporting data
- `GET /api/communication/inbox`
- `GET /api/communication/escalations`
- `GET /api/lookups`

## Data Objects Used
Main dataset tables used by this module:

- `message_logs`
- `chat_threads`
- `advisory_logs`
- `disease_logs`
- `escalations`
- `input_demands` (for intent side effects)

## Current Behavior Contract
For acceptance in this POC, all of the following must hold:

1. Office `Open` selects the ticket and target farmer.
2. `Open` changes status from `pending` to `in_progress`.
3. Office reply writes to shared chat thread as `outgoing`.
4. Reply action marks targeted ticket `resolved`.
5. Farmer phone thread shows the office reply for selected farmer.
6. Queue counts update after status transitions.

## Development Plan for This Module
## Phase 1 (Completed Baseline)
- dual perspective UI (phone + office)
- queue columns and ticket states
- basic send/reply flows
- integration with synthetic dataset

## Phase 2 (Stabilization)
- add selected ticket banner with explicit ticket ID
- add per-ticket timeline (created, opened, replied)
- add clearer empty and loading states
- add guardrails when no ticket/farmer is selected

## Phase 3 (Operational Usability)
- add office filters by intent/severity
- add assignee field for office operators
- add quick canned replies
- add first response time and resolution time metrics

## Phase 4 (Bridge to Real Integration)
- abstract message transport interface
- map simulation payloads to provider-like schema
- create adapter boundary for future WhatsApp API integration

## Relationship to understanding.md
This module implements core points from `understanding.md`:

- FPO-first operating layer, not generic consumer chat
- communication as operational data input, not isolated messaging
- workflow trust via visibility and escalation handling
- practical business value through demand capture and faster response

It validates the research hypotheses that simple interaction channels can drive adoption and improve operational coordination.

## Relationship to dev-plan.md
This module directly implements `dev-plan.md` Module B:

- communication and advisory simulator
- synthetic inbound messages
- intent classification and routing
- escalation tracking
- linkage to operations and reporting

It also supports cross-module demo narrative in the plan:

- farmer message -> input demand capture -> procurement workflow
- disease query -> escalation queue
- message history -> KPI and adoption evidence

## Testing Checklist
- send farmer message and verify inbox row created
- open ticket and verify status moves to `in_progress`
- reply from office and verify status moves to `resolved`
- verify reply appears in farmer phone thread
- verify input request creates demand record
- verify disease query creates escalation
- verify queue counts refresh correctly

## Risks and Controls
### Risk
Queue and thread get out of sync in UI.

### Control
Always refetch thread and inbox after status/reply actions.

### Risk
Office replies are not tied to specific ticket.

### Control
Reply endpoint accepts `message_id` and updates targeted message state.

### Risk
Users cannot tell who is selected.

### Control
Show selected farmer + selected ticket banner above reply box.

## Future Production Notes
When moving beyond POC:

- replace simulation send/reply endpoints with provider adapter
- add consent and identity checks
- add delivery and failure state handling
- persist conversation state in durable DB
- add operator roles and access controls

Until then, this module should be treated as a high-fidelity workflow simulation for business validation.
