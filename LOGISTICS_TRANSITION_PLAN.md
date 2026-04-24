# Logistics Application Implementation Plan

## Purpose

This plan describes how to build a logistics-focused application for an import/export client, with WhatsApp as the primary customer interaction channel.

The target end state is:

- customers message on WhatsApp for shipment tracking, ETA, milestone, documentation, and issue-status questions
- the system answers automatically when the request can be resolved from trusted shipment data
- only ambiguous, high-risk, finance-sensitive, dispute-related, or data-missing cases are handed to human operators
- the dashboard becomes an internal logistics control tower for operators, escalation owners, and managers

This document must be treated as a standalone implementation specification. The implementing agent should assume they do not have access to any prior dashboard, any existing codebase, or any local project folder. Everything needed to build the first version should be defined here in product, architecture, data, API, workflow, and delivery terms.

## External Agent Instructions

### Working assumption

Assume a greenfield implementation.

Do not assume access to:

- any existing dashboard code
- existing Flask or React files
- any local mock data
- any existing database schema
- any prebuilt WhatsApp integration

You may use any reasonable stack, but the delivered system must satisfy the contracts and workflows in this document.

### What you are building

Build a logistics customer-service platform with two operating surfaces:

1. `Customer channel`
   - WhatsApp-style messaging is the primary customer entry point in the first build
   - the first release should emulate the channel before integrating a live provider
   - customers ask tracking, ETA, documentation, customs, and delay questions
2. `Internal operations dashboard`
   - operators monitor shipments, exceptions, handoffs, and customer conversations
   - managers monitor automation rate, SLA risk, and escalation load

### Minimum deliverables

The first implementation must include all of the following:

1. Backend API for logistics entities, conversations, handoffs, and notifications.
2. Persistent data model for customers, shipments, references, milestones, documents, exceptions, messages, and handoff tickets.
3. A mock or emulated WhatsApp-style message ingestion boundary for phase 1, with a provider-compatible adapter interface for future real integration.
4. An agent decision layer that can:
   - resolve shipment questions automatically from structured data
   - ask one clarification question when needed
   - hand off to humans when risk or ambiguity is too high
5. An internal dashboard with:
   - control tower
   - emulated customer chat surface
   - shipments view
   - tracking search
   - handoff desk
   - notifications view
   - docs/compliance view
6. Seed/demo data that simulates realistic import/export workflows.
7. Automated tests for shipment resolution, escalation routing, and customer reply safety.

## Communication Emulation Baseline

For the first build, do not start with a real WhatsApp Business API integration.

The initial product should reproduce a high-fidelity WhatsApp-style simulation with provider-like boundaries. This is important because the reference behavior for the prototype is not "live WhatsApp," it is "shared synthetic conversation state presented through a phone-style customer view and an office-side handling console."

### Required communication model

Implement the communication layer with these separate but linked records:

- `message_logs`
  - one row per inbound customer ask
  - acts like the ticket / case record
- `chat_threads`
  - message-bubble stream for customer and office conversation history
  - contains both incoming and outgoing chat items
- `handoff_tickets` or `escalations`
  - operational routing records for human-required cases
- `broadcasts`
  - synthetic outbound bulk messages
- `broadcast_recipients`
  - delivery/read state per recipient in demo mode

### Required dual-surface UX

The first build should provide two communication surfaces backed by the same conversation data:

1. `Customer phone simulator`
   - choose a known customer/contact identity
   - type an inbound message in a phone-like UI
   - display the shared thread as chat bubbles
   - show both customer messages and office/agent replies

2. `Office console`
   - display message/ticket lanes for operational handling
   - show ticket details, timeline, and linked thread
   - allow office replies, agent replies, and manual status changes

### Required handoff desk behavior

The handoff desk must behave like an escalations-only board.

That means:

- the board shows only messages that require human attention
- those items are split into:
  - `New`
  - `In Progress`
  - `Resolved`
- opening a `New` ticket changes status to `In Progress`
- opening a ticket must not generate any synthetic chat noise
- sending an office reply must append an outgoing chat item linked to the selected inbound message
- replying must move the linked ticket to `Resolved`
- operators must also be able to:
  - mark a ticket `In Progress`
  - resolve without replying
  - reopen a resolved ticket

### Required message lifecycle

Use this lifecycle for inbound customer asks:

1. `pending`
2. `in_progress`
3. `resolved`

If a handoff/escalation object exists, keep it synchronized with the message state:

- `pending` message -> `open` escalation
- `in_progress` message -> `in_progress` escalation
- `resolved` message -> `closed` escalation

### Required broader communication board

In addition to the escalations-only handoff desk, include a broader communication board that can show:

- all inbound messages
- escalations only
- outbound broadcasts

This is separate from the handoff desk. The handoff desk is only for messages requiring people. The broader board is for total communication visibility.

### Required inbound simulation behavior

For each inbound simulated customer message:

1. create a `message_log` row with `pending` status
2. create an incoming `chat_thread` row
3. classify the message intent
4. create any required business side effects
5. attempt an agent reply immediately
6. either:
   - resolve automatically
   - leave in progress for ongoing workflow
   - create a handoff/escalation

### Required thread behavior

- backend thread retrieval may return newest-first for pagination efficiency
- chat UI should sort ascending for natural conversation display
- outgoing agent and office replies must appear in the same shared thread as inbound customer messages

### Required broadcast behavior

The first build should also emulate outbound campaigns / advisories:

- office creates a broadcast
- recipients are selected from synthetic data
- the broadcast is appended into the customer thread as outgoing chat
- a synthetic `YES` reply or equivalent acknowledgment can mark the broadcast as read

## Agent Behavior Baseline

The first implementation should reproduce the existing agent style as an orchestrated multi-agent system, not as a single freeform chatbot.

### Reactive agent behavior

The default communication rule is:

- every inbound customer message gets an attempted agent response
- only unresolved, ambiguous, low-confidence, policy-blocked, or explicitly human-required cases land on the handoff desk

This means the agent layer is the default responder, not a side feature.

### Reactive processing steps

For each inbound message:

1. classify intent
2. build structured context from known customer/shipment records
3. choose a direct-answer path if deterministic
4. otherwise use model-assisted reply drafting if safe
5. if confidence/risk fails, create a handoff but still send a short holding reply when appropriate

### Required specialist agents

Use specialist agents rather than a single undifferentiated assistant. For the logistics build, preserve this pattern:

- `agent_intake`
  - classifies inbound asks and routes them
- `agent_tracking`
  - answers shipment status, milestone, and ETA questions
- `agent_documents`
  - answers or follows up on document/compliance questions
- `agent_notifications`
  - sends proactive milestone and reminder messages
- `agent_exception`
  - owns human handoff creation and exception routing

### Required proactive agent cycle

In addition to per-message reactive replies, implement a manual or scheduled orchestration cycle that can:

- scan for shipments needing proactive alerts
- scan for stale data or exception conditions
- create notification tasks
- create handoff tasks
- record a run summary

### Required agent observability

Persist and expose:

- `agent_runs`
  - one record per triggered cycle or per-message orchestrated run
- `agent_tasks`
  - unit work items executed by specific agents
- `agent_alerts` or equivalent
  - proactive messages or reminders generated by the system

The control tower should show:

- specialist agents
- active/pending work
- recent runs
- handoff count
- tasks requiring people

Recommended addition:

- a replay or walkthrough view that can reconstruct the latest agent cycle from persisted run events

### Required model availability handling

Expose whether a live model is available or whether the system is in fallback mode.

This lets the UI show a state like:

- `Live`
- `Fallback`

In fallback mode, the system should still process messages using deterministic or heuristic routing and should still create handoffs correctly.

### Recommended greenfield stack

If the agent is free to choose, use this reference stack:

- frontend: React
- backend API: Python FastAPI or Flask
- database: PostgreSQL
- background jobs: Celery / RQ / equivalent queue worker
- cache/session/queue broker: Redis
- auth for internal users: JWT or session-based auth
- customer messaging boundary: provider adapter interface with mock implementation first

Equivalent alternatives are acceptable if they preserve the same system behavior.

## Design Language Plan

The first implementation should not look like a generic enterprise CRUD app. It should feel like a premium operations tool: calm, legible, lightly atmospheric, and designed for data-heavy work without visual noise.

### Visual direction

Use a light glassmorphism system with a green monochromatic palette and a soft animated aurora mesh background.

The visual personality should be:

- calm
- precise
- premium
- trustworthy
- operational rather than marketing-heavy

The background provides brand character. The surfaces on top should stay restrained and highly readable.

### Mode

- light mode only in v1
- no dark mode requirement
- no purple bias
- no neon cyber style
- avoid heavy shadows or opaque panels that kill the glass effect

### Core palette

Use CSS tokens or design tokens and reference them consistently.

```css
--green-900: #1B5E20;
--green-700: #2E7D32;
--green-600: #388E3C;
--green-500: #4CAF50;
--green-300: #81C784;
--green-200: #A8DCA8;
--green-100: #CBE6C8;
--green-50:  #E6F4EA;

--white:     #FFFFFF;
--off-white: #F8FAF8;
--bg-base:   #F2F6F2;

--gray-50:   #F5F7F5;
--gray-100:  #E8ECE8;
--gray-200:  #D0D5D0;
--gray-300:  #B0B8B0;
--gray-400:  #8A928A;
--gray-500:  #6B736B;
--gray-600:  #4A524A;
--gray-700:  #2D332D;
--gray-800:  #1A1F1A;

--red-500:   #EF5350;
--red-100:   #FFCDD2;
--amber-500: #FFA726;
--amber-100: #FFE0B2;

--surface-inset: rgba(27, 94, 32, 0.04);
--green-tint-bg: rgba(76, 175, 80, 0.08);
```

### Semantic colors

Use a limited semantic system:

- success / healthy / on-time: green
- warning / delayed / in-progress / at-risk: amber
- critical / blocked / escalation / customs hold: red
- neutral / metadata / read-only context: gray

Do not create large numbers of unrelated accent colors.

### Typography

Use a clean sans-serif system. The reference style uses `Inter`, which is acceptable here because the implementation should preserve the feel of the prototype design language.

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--text-xs:   11px;
--text-sm:   13px;
--text-base: 15px;
--text-lg:   22px;
--text-xl:   28px;
```

Use these roles:

- app title: `15px / 500`
- section title: `22px / 600`
- card/table title: `15px / 600`
- stat label: `11px / 600 uppercase`
- stat value: `28px / 600`
- body text: `13px / 400`
- meta text: `11px / 400 to 600`

Use tabular numerals for metrics, ETAs, counts, and time values.

### Spacing and radius

```css
--space-1: 6px;
--space-2: 12px;
--space-3: 20px;
--space-4: 32px;
--space-5: 48px;

--radius-sm: 8px;
--radius-md: 12px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-pill: 100px;
```

### Glass surface system

Use exactly three glass tiers.

```css
--glass-light:  rgba(255, 255, 255, 0.42);
--glass-normal: rgba(255, 255, 255, 0.58);
--glass-strong: rgba(255, 255, 255, 0.74);

--border-glass: 1px solid rgba(203, 230, 200, 0.28);
--border-subtle: 1px solid rgba(203, 230, 200, 0.18);
```

Glass rules:

- every glass surface must declare:
  - translucent background
  - backdrop blur
  - border
  - border radius
- do not invent ad hoc opacity values outside the three defined tiers
- top bar and sidebar should use stronger glass than content cards
- tables inside glass cards should not get their own independent glass treatment

### Background system

Use a restrained aurora mesh background.

Rules:

- maximum 6 animated blobs
- opacity ceiling around `0.20`
- soft greens only
- large blur radii
- slow drift and breathe animations
- no high-contrast moving gradients behind text-heavy content

The content area must remain readable even if the mesh is removed. The background is supportive, not structural.

### App shell

Use this layout:

- top bar: `60px` height
- left sidebar: `220px` expanded, `52px` collapsed
- content padding: `28px`
- content max width: `1440px`

Top bar contents:

- small brand avatar
- product title `Logistics Control Tower`
- environment/demo metadata
- role switcher
- optional refresh / reseed / mode controls

Sidebar behavior:

- icon + label rows
- active row uses green-tinted background and a left accent
- collapsed state shows icon only with tooltip
- avoid heavy dividers

### Core components

#### Stat cards

Style:

- glass-normal
- no thick colored side border
- compact label, large number, small helper line
- optional small severity dot or badge

Use for:

- active shipments
- delayed shipments
- customs holds
- open handoffs
- auto-resolution rate
- stale data alerts

#### Tables

Style:

- title sits above the glass card
- subtle striped rows
- strong hover state using green tint
- compact header typography
- inline badges for status
- no heavy outer borders

#### Buttons

Primary button:

- green gradient
- `36px` height
- medium radius
- `13px / 600`

Ghost button:

- transparent
- subtle border
- green-tint hover state
- `36px` height

Small button variants:

- `28px` height
- use in tables, ticket actions, and filter bars

#### Inputs and filters

Use soft glass inputs:

- `40px` height for standard fields
- rounded
- translucent white background
- visible focus state in green

Filters should be pills or compact inline controls, not heavy form blocks.

#### Badges

One consistent pill system:

- `20px` height
- `11px / 600 uppercase`
- pill radius
- semantic colors only

Use badges for:

- status
- priority
- intent
- escalation category
- live/fallback model state

#### Drawers

Use right-side drawers for create/edit actions:

- width around `400px`
- glass-strong
- slide over content, do not push layout
- form actions pinned at the bottom when practical

### Communication and handoff design

This is the most important visual area to preserve accurately.

#### Customer phone simulator

The phone simulator should look intentionally like a WhatsApp-style mock, not a literal WhatsApp clone.

Use:

- fixed-width phone frame around `320px`
- fixed-height around `620px`
- dark outer shell
- light conversation background inside
- message bubbles with clear incoming/outgoing distinction
- header bar with contact/help desk identity
- bottom composer for simulated inbound messages

Important:

- keep the phone frame fixed-size on desktop
- on narrow screens, allow horizontal scrolling before destroying the phone proportions

#### Office communication board

Use a Kanban-style board:

- `New`
- `In Progress`
- `Resolved`

Each card should show:

- short ticket id
- latest customer message
- customer/contact name
- timestamp
- intent badge
- status badge

#### Handoff desk

The handoff desk should feel like a human exception console, not a general inbox.

Design requirements:

- show only escalated items
- use three lanes
- selecting a ticket opens a detail panel
- detail panel includes:
  - reporter/contact
  - latest message
  - timeline
  - shared thread
  - reply box
  - agent reply button
  - resolve / reopen controls

#### Broader communication board

The broader communication board can show all messages, escalations, and broadcasts in separate tabs or views.

It should share visual DNA with the handoff desk, but it is a broader operational inbox rather than an escalations-only space.

### Control tower design

The control tower should be the most presentation-ready view.

It should show:

- top KPIs
- named specialist agent cards
- a compact handoff/exception panel
- recent run summary
- recent task pulse feed

Tone:

- polished
- live
- readable from a distance
- suitable for demo narration

### Motion rules

Use motion for only three purposes:

1. entry
2. interaction feedback
3. subtle background atmosphere

Allowed patterns:

- fade/slide in for cards and drawers
- tiny hover lift for interactive cards
- tap scale on buttons
- slow aurora mesh drift

Avoid:

- bouncing
- looping attention-seeking UI motion
- flashy micro-animations on tables or stats

### Responsive behavior

Desktop:

- full shell with sidebar
- two-column or three-column operational layouts
- fixed phone mock on communication screens

Tablet:

- sidebar may collapse by default
- secondary panels stack below primary panels

Mobile:

- stack most dashboard content vertically
- preserve the phone mock proportions
- convert multi-column boards into tabs or vertically stacked lanes

### Accessibility and readability

Requirements:

- maintain strong contrast for text on glass surfaces
- never place dense text directly over animated mesh without a glass panel
- visible keyboard focus states
- all icon-only controls need labels/tooltips
- do not use color alone to represent severity or status

### What not to do

- do not use flat white tables on a flat white page
- do not over-darken the UI
- do not create 10 different accent colors for statuses
- do not make the handoff desk look like a generic CRM
- do not make the phone simulator responsive by distorting the device frame
- do not let decorative motion compete with operational content

### Suggested greenfield project structure

If starting from scratch, use a layout similar to this:

```text
logistics-app/
  apps/
    api/
      src/
        routes/
        services/
        repositories/
        models/
        integrations/
        agents/
        tests/
    web/
      src/
        pages/
        components/
        sections/
        api/
        state/
        styles/
  packages/
    contracts/
      api-schemas/
      prompts/
      seed-scenarios/
  infra/
    docker/
    migrations/
    env/
  docs/
    architecture.md
    api.md
    operations.md
```

### Mandatory implementation rules

1. The LLM must never invent logistics facts.
2. All shipment answers must be derived from structured shipment snapshots.
3. Shipment details must not be disclosed unless contact-to-shipment authorization passes.
4. Customs holds, disputes, claims, detention/demurrage, and billing issues must default to human handoff.
5. Every automated answer must be auditable.
6. The agent may ask at most one clarification question before either answering or handing off.

## Greenfield Build Sequence

Use this exact build order if no codebase is available.

### Step 1: Bootstrap the platform

Create:

- backend service
- frontend dashboard
- database migrations
- seed script
- environment configuration
- test harness

Initial environment variables:

```text
APP_ENV=development
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
WHATSAPP_PROVIDER=mock
WHATSAPP_WEBHOOK_SECRET=
DEFAULT_TIMEZONE=UTC
```

### Step 2: Create the core database schema

Create tables for:

- `accounts`
- `contacts`
- `shipments`
- `shipment_references`
- `containers`
- `shipment_milestones`
- `shipment_documents`
- `shipment_exceptions`
- `conversation_threads`
- `message_logs`
- `handoff_tickets`
- `notifications`
- `notification_deliveries`
- `agent_runs`
- `agent_tasks`
- `audit_logs`
- `internal_users`
- `team_assignments`

Add indexes on:

- `contacts.phone`
- `shipment_references.reference_value`
- `shipments.job_no`
- `shipments.booking_no`
- `shipments.bl_no`
- `containers.container_no`
- `message_logs.created_at`
- `handoff_tickets.status`
- `handoff_tickets.owner_team`
- `shipment_milestones.shipment_id, event_time desc`

### Step 3: Seed realistic logistics demo data

Create synthetic records for:

- 20 to 50 customer accounts
- 2 to 5 contacts per account
- 300 to 1,000 shipments
- mixed import, export, sea, air, and road movements
- realistic event timelines
- realistic delays, holds, and document gaps
- conversation history with both auto-resolved and handed-off cases

Seed at least these scenarios:

1. in-transit shipment with clean data
2. shipment delayed due to vessel rollover
3. shipment blocked by missing customer document
4. shipment under customs hold
5. ambiguous message where a contact has multiple active shipments
6. billing/dispute case requiring handoff

### Step 4: Implement reference extraction and authorization

Implement deterministic extraction for:

- container number
- booking number
- BL / HBL
- job number
- invoice number if relevant to the client

Then implement shipment authorization:

- a contact may access shipments belonging to their account
- allow optional whitelist overrides for cross-account agents or brokers
- if authorization fails, return a safe non-disclosing message and create a handoff ticket

### Step 5: Implement normalized shipment snapshot generation

Create a service that builds a single canonical snapshot object per shipment.

The snapshot must include:

- shipment identifiers
- customer ownership
- current normalized status
- last milestone
- current ETA / ETD if available
- document summary
- exception summary
- data freshness
- customer-safe next step

Every UI surface and every customer reply must use this snapshot object rather than raw tables.

### Step 6: Implement inbound WhatsApp workflow

For every inbound message:

1. resolve contact by phone
2. create or update conversation thread
3. persist message log
4. classify intent
5. extract shipment references
6. resolve shipment candidates
7. apply authorization
8. choose one of:
   - answer
   - clarify
   - handoff
9. persist reply and decision metadata
10. surface the result in the dashboard

The first version of this workflow should be reachable through a mock/emulated communication endpoint and customer phone simulator, not a live provider integration.

### Step 7: Implement agent reply policy

The agent reply policy must be deterministic at the orchestration level.

The LLM may help phrase the response, but it must not decide facts or perform database lookup itself.

Decision outcomes:

- `answer_directly`
- `ask_clarifying_question`
- `handoff_to_human`

### Step 8: Implement internal handoff desk

Build a ticket queue with:

- status
- category
- priority
- owner team
- owner user
- SLA due time
- suggested reply
- linked shipment snapshot
- linked conversation

### Step 9: Implement proactive notifications

Build notification flows for:

- milestone reached
- ETA changed
- delayed shipment
- customs cleared
- document reminder

### Step 10: Implement audit, metrics, and tests

Every answer, escalation, reassignment, and closure must be stored in an audit trail.

Track:

- auto-resolution rate
- human handoff rate
- first response time
- SLA breach count
- stale data count
- delayed shipment count
- customs hold count

## Definition of Done for the External Agent

The first implementation is acceptable only if all of the following are true:

1. A customer can ask for shipment status over WhatsApp and receive a correct automated answer when the shipment is confidently resolved.
2. A customer with multiple matching shipments receives one clarification question before escalation.
3. Billing, customs hold, dispute, claim, and human-request messages always create handoff tickets.
4. Operators can view, assign, respond to, and close handoff tickets in the dashboard.
5. Managers can see automation, delay, and escalation KPIs in the control tower.
6. Synthetic data supports a realistic demo without any external integrations.

## Product Definition

The new product is a logistics operations dashboard with a WhatsApp-first customer service layer.

### Primary business goal

Let customers ask logistics questions in plain language and get immediate, reliable answers without operator involvement unless:

- the shipment cannot be confidently identified
- the source data is stale or missing
- the question is about a dispute, claim, billing, detention/demurrage, customs/legal hold, or damaged cargo
- the customer explicitly asks for a human
- the conversation falls below confidence or authorization thresholds

### Primary user groups

- external customers asking shipment questions over WhatsApp
- internal operators monitoring shipments and exceptions
- escalation owners for documentation, customs, finance, or key accounts
- supervisors reviewing SLA, handoff load, and automation effectiveness

### Core use cases

- "Where is my shipment?"
- "Has container ABCD1234567 been loaded?"
- "What is the ETA to destination warehouse?"
- "Has customs cleared my shipment?"
- "Are documents pending from my side?"
- "Why is this shipment delayed?"
- "Share latest shipment status for booking BK12345"
- "I need a human"

## Implementation Strategy

Use a two-track approach:

1. Build a logistics demo variant using synthetic data and a mock WhatsApp provider.
2. Add clean integration boundaries so the same product can later pull from the client's actual TMS, ERP, WMS, shipping line, and customs data sources.

This keeps implementation realistic and avoids blocking the UI and agent work on external integration dependencies.

## Recommended Business Modules

Use these top-level product sections:

- `Control Tower`
- `Customers`
- `Shipments`
- `Tracking`
- `Handoff Desk`
- `Notifications`
- `Docs & Compliance`
- `Approvals & Audit`

## Target Domain Model

Implement a logistics data model that supports deterministic status lookup before LLM answer generation.

### Core entities

1. `accounts`
   - shipper, consignee, importer, exporter, forwarding customer, agent partner
   - fields:
     - `id`
     - `account_name`
     - `account_type`
     - `country`
     - `customer_code`
     - `service_tier`
     - `active`

2. `contacts`
   - WhatsApp-facing humans tied to accounts
   - fields:
     - `id`
     - `account_id`
     - `name`
     - `phone`
     - `email`
     - `role`
     - `whatsapp_opt_in`
     - `allowed_reference_scope`

3. `shipments`
   - canonical job record
   - fields:
     - `id`
     - `job_no`
     - `booking_no`
     - `bl_no`
     - `house_bl_no`
     - `mode` (`sea`, `air`, `road`)
     - `movement_type` (`import`, `export`, `domestic`)
     - `service_type` (`fcl`, `lcl`, `air_freight`, `customs`, `door_delivery`)
     - `account_id`
     - `origin_port`
     - `destination_port`
     - `origin_country`
     - `destination_country`
     - `eta`
     - `etd`
     - `current_status`
     - `current_substatus`
     - `last_event_at`
     - `data_freshness_minutes`
     - `risk_level`
     - `assigned_team`

4. `shipment_references`
   - normalized lookup keys
   - fields:
     - `id`
     - `shipment_id`
     - `reference_type` (`container_no`, `booking_no`, `bl_no`, `job_no`, `invoice_no`)
     - `reference_value`

5. `containers`
   - for FCL/LCL container visibility
   - fields:
     - `id`
     - `shipment_id`
     - `container_no`
     - `container_type`
     - `seal_no`
     - `container_status`
     - `current_location`
     - `last_event_at`

6. `shipment_milestones`
   - event history for agent answers and timeline UI
   - fields:
     - `id`
     - `shipment_id`
     - `container_id`
     - `event_code`
     - `event_label`
     - `event_time`
     - `location`
     - `source_system`
     - `source_ref`
     - `normalized_status`
     - `is_exception`

7. `shipment_documents`
   - document status, not necessarily file-storage in phase 1
   - fields:
     - `id`
     - `shipment_id`
     - `document_type`
     - `document_status`
     - `required_from`
     - `received_at`
     - `pending_reason`

8. `shipment_exceptions`
   - operation-side exception register
   - fields:
     - `id`
     - `shipment_id`
     - `exception_type`
     - `severity`
     - `status`
     - `owner_team`
     - `owner_name`
     - `opened_at`
     - `target_resolution_at`
     - `root_cause`
     - `customer_visible_summary`

9. `conversation_threads`
   - use customer/account-linked conversation threads
   - fields:
     - `id`
     - `account_id`
     - `contact_id`
     - `channel` (`whatsapp`)
     - `latest_message_at`
     - `last_resolved_at`
     - `open_ticket_count`

10. `message_logs`
    - use a ticket-oriented inbound message record
    - required fields:
      - `contact_id`
      - `account_id`
      - `shipment_id`
      - `resolved_references`
      - `intent_confidence`
      - `reply_confidence`
      - `stale_data`
      - `needs_clarification`
      - `source_channel_message_id`

11. `handoff_tickets`
    - separate internal work queue from external chat
    - fields:
      - `id`
      - `message_id`
      - `shipment_id`
      - `account_id`
      - `category`
      - `priority`
      - `owner_team`
      - `owner_user`
      - `sla_due_at`
      - `status`
      - `handoff_reason`

12. `agent_runs` and `agent_tasks`
    - keep these concepts
    - repurpose task types for logistics actions and decisioning

### Canonical shipment status model

Create a normalized status engine so customer replies never depend on raw upstream wording alone.

Minimum normalized statuses:

- `booking_received`
- `booking_confirmed`
- `cargo_pending`
- `cargo_received`
- `docs_pending_customer`
- `docs_under_review`
- `customs_in_progress`
- `customs_hold`
- `customs_cleared`
- `gated_in_origin`
- `loaded_on_vessel`
- `in_transit`
- `transshipment`
- `arrived_destination_port`
- `discharged`
- `available_for_delivery`
- `out_for_delivery`
- `delivered`
- `completed`
- `delayed`
- `exception_open`

Every shipment answer shown to a customer should be composed from this normalized status plus the latest milestone facts.

## WhatsApp-First Service Design

### Core message pipeline

For every inbound WhatsApp message:

1. persist the raw inbound message
2. resolve contact by phone number
3. infer account and allowed shipment scope
4. extract references from text
   - container number
   - booking number
   - BL / HBL
   - job number
5. classify the intent
6. resolve the target shipment
7. fetch the canonical shipment snapshot
8. decide one of:
   - answer directly
   - ask one clarifying question
   - escalate / handoff
9. persist reply, reason, confidence, and cited data timestamps
10. update dashboard queues and audit trail

### Intent taxonomy

Replace `_infer_intent(...)` with logistics intents:

- `tracking_status`
- `eta_request`
- `milestone_request`
- `document_status`
- `customs_status`
- `delay_reason`
- `charge_or_invoice_query`
- `booking_request`
- `proof_request`
- `human_request`
- `complaint_or_claim`
- `general_ack`

### Reference extraction rules

Implement deterministic extraction before LLM use.

Minimum regex patterns:

- container number: `^[A-Z]{4}[0-9]{7}$`
- booking number: configurable client format
- BL / HBL: configurable client format
- job number: configurable client format

If multiple shipments match:

- ask one clarifying question if the contact has <= 3 recent open shipments
- otherwise hand off to human with `category=reference_ambiguity`

### Authorization rules

The bot must not answer shipment details unless the contact can be linked to the shipment by:

- `account_id` ownership
- whitelisted reference mapping
- explicit internal override

If authorization fails:

- do not answer with shipment facts
- reply with a safe generic message
- create a high-priority handoff ticket

### Auto-resolution rules

Auto-answer if all are true:

- shipment matched confidently
- data freshness under threshold
- no sensitive exception category
- reply confidence >= threshold
- no explicit human request

Escalate if any are true:

- `customs_hold`
- `complaint_or_claim`
- billing or finance dispute
- cargo damage / missing cargo
- detention or demurrage question
- upstream data stale beyond SLA
- no shipment match
- multiple shipment matches after one clarification
- customer asks for a human
- low reply confidence

### WhatsApp answer style

Customer replies should be generated from structured facts, not freeform hallucinated summaries.

Reply constraints:

- 2 to 5 sentences
- mention shipment identifier used
- include last known milestone
- include timestamp or "last updated" indicator
- include next expected step when known
- never invent ETA, clearance, release, or delivery dates

Example reply shape returned by agent orchestration:

```json
{
  "action": "reply",
  "intent": "tracking_status",
  "intent_confidence": 0.95,
  "shipment_id": "SHIP_0042",
  "resolved_references": {
    "container_no": "MSCU1234567"
  },
  "reply_text": "Container MSCU1234567 is currently in transit. The latest recorded milestone is Loaded on Vessel at Nhava Sheva on 2026-04-19 13:20 UTC. Current ETA to Jebel Ali is 2026-04-24, and I will update you if there is a delay.",
  "reply_confidence": 0.92,
  "requires_handoff": false,
  "handoff_reason": "",
  "facts_used": [
    "shipment.current_status",
    "shipment.eta",
    "latest_milestone.event_label",
    "latest_milestone.event_time"
  ]
}
```

## Target Backend Design

### Suggested backend implementation approach

Keep the API entrypoint thin.

Do not place all logistics logic in a single route file. Separate routing, repositories, status normalization, reference extraction, agent orchestration, and handoff routing into independent modules.

Recommended structure:

```text
apps/api/src/
  main.py
  seed/
    logistics_seed.py
  logistics/
    __init__.py
    models.py
    repositories.py
    intents.py
    references.py
    status_engine.py
    snapshots.py
    agent.py
    escalation.py
    provider_adapter.py
```

If the implementation agent needs to move faster, phase 1 may keep route wiring in one file while extracting these helper modules first.

### Backend modules to add

1. `seed/logistics_seed.py`
   - synthetic logistics dataset generator
   - new demo profile: `logistics_demo`

2. `logistics/repositories.py`
   - all dataset reads/writes for shipments, contacts, milestones, documents, tickets
   - avoid direct ad hoc traversal of `DATASET` everywhere

3. `logistics/references.py`
   - extract and normalize reference numbers from text

4. `logistics/intents.py`
   - deterministic first-pass intent classifier
   - leave room for model-assisted classification later

5. `logistics/status_engine.py`
   - map raw milestone events into normalized status

6. `logistics/snapshots.py`
   - build a single shipment snapshot object for UI and agent use

7. `logistics/agent.py`
   - replace farming reply logic with logistics reply orchestration
   - build structured JSON response contract

8. `logistics/escalation.py`
   - classify handoff reason, owner team, and SLA due time

9. `logistics/provider_adapter.py`
   - adapter boundary for real shipping/TMS updates
   - no real vendor-specific code required in phase 1

### New backend endpoints

Expose logistics-first endpoints directly.

#### Control tower

- `GET /api/logistics/dashboard/summary`
- `GET /api/logistics/control-tower`

#### Master data

- `GET /api/logistics/accounts`
- `GET /api/logistics/contacts`
- `POST /api/logistics/accounts`
- `POST /api/logistics/contacts`

#### Shipments

- `GET /api/logistics/shipments`
- `GET /api/logistics/shipments/<shipment_id>`
- `GET /api/logistics/shipments/<shipment_id>/milestones`
- `GET /api/logistics/shipments/<shipment_id>/documents`
- `GET /api/logistics/shipments/<shipment_id>/exceptions`
- `POST /api/logistics/shipments`
- `POST /api/logistics/shipments/<shipment_id>/milestones`
- `POST /api/logistics/shipments/<shipment_id>/exceptions`

#### Search and reference resolution

- `GET /api/logistics/search?q=...`
- `POST /api/logistics/reference-resolve`

#### Conversation / handoff

- `GET /api/communication/inbox`
- `GET /api/communication/escalations`
- `GET /api/communication/agent-config`
- `POST /api/communication/mock-whatsapp/send`
- `GET /api/communication/mock-whatsapp/thread`
- `POST /api/communication/mock-whatsapp/reply`
- `POST /api/communication/agent-reply`
- `POST /api/communication/messages/<message_id>/status`
- `GET /api/logistics/handoffs`
- `POST /api/logistics/handoffs/<ticket_id>/assign`
- `POST /api/logistics/handoffs/<ticket_id>/resolve`
- `POST /api/logistics/messages/<message_id>/clarify`

#### Notifications

- `GET /api/logistics/notifications`
- `POST /api/logistics/notifications/send`
- `POST /api/logistics/shipments/<shipment_id>/notify`
- `GET /api/communication/broadcasts`
- `POST /api/communication/broadcasts`
- `GET /api/communication/broadcasts/<broadcast_id>/recipients`
- `POST /api/communication/broadcasts/<broadcast_id>/simulate-reply`

#### Integration sync

- `POST /api/logistics/sync/import`
- `POST /api/logistics/provider/webhook`

### Backend service chain

Implement the inbound message flow as this logistics orchestration chain:

- `infer_logistics_intent(...)`
- `extract_logistics_references(...)`
- `resolve_contact_scope(...)`
- `resolve_shipment_from_message(...)`
- `build_shipment_snapshot(...)`
- `generate_logistics_agent_reply(...)`
- `create_logistics_handoff(...)`

## Target Frontend Design

### Frontend implementation rule

Do not implement the full dashboard in one monolithic page file. Each logistics area should have its own page-level section component plus shared table, drawer, timeline, badge, and form primitives.

Recommended structure:

```text
apps/web/src/sections/
  ControlTowerSection.jsx
  CustomersSection.jsx
  ShipmentsSection.jsx
  CustomerChatSimulatorSection.jsx
  TrackingSection.jsx
  HandoffDeskSection.jsx
  CommunicationBoardSection.jsx
  NotificationsSection.jsx
  DocsComplianceSection.jsx
  ApprovalsSection.jsx
```

### Navigation and copy changes

Ensure the application copy reads as a logistics product throughout:

- use logistics terminology for all navigation and labels
- keep customer-facing and operator-facing language distinct
- avoid any agriculture-specific wording

Suggested branding:

- app title: `Logistics Control Tower`
- WhatsApp / handoff section: `Customer Handoff Desk`

### New section definitions

1. `Control Tower`
   - automation rate
   - open handoffs
   - at-risk shipments
   - stale data alerts
   - customs holds
   - delayed shipments
   - recent agent decisions

2. `Customers`
   - account list
   - contact list
   - WhatsApp opt-in status
   - recent conversations by customer

3. `Shipments`
   - shipment table
   - timeline drawer
   - documents state
   - exception state
   - account ownership

4. `Customer Chat Simulator`
   - phone-style customer conversation view
   - contact selector in demo mode
   - shared thread display
   - inbound message composer for simulation

5. `Tracking`
   - shipment search by container / booking / BL / job no
   - milestone timeline
   - normalized status badge
   - ETA / ETD cards

6. `Handoff Desk`
   - escalations-only board
   - ticket reason
   - owner team
   - SLA due time
    - one-click assignment / reply / close

7. `Notifications`
   - proactive milestone updates
   - delay advisories
   - document reminder campaigns
   - template preview and send history

8. `Docs & Compliance`
   - document checklist by shipment
   - pending customer docs
   - customs status blocks
   - exception reasons

9. `Approvals & Audit`
   - include approval and audit surfaces for sensitive logistics actions if needed

## Detailed Implementation Phases

## Phase 0: Define architecture and delivery surface

### Goal

Create a safe baseline before implementation begins.

### Tasks

- finalize the system architecture document
- define the demo data profile `logistics_demo`
- define the API namespaces
- define the messaging provider boundary
- define the handoff and SLA policy

### Deliverable

The implementation team has a clear contract for services, entities, routes, and demo behavior.

## Phase 1: Introduce synthetic logistics data

### Goal

Make the product and agent flow buildable without waiting on client integrations.

### Tasks

- create a logistics seed module
- define generator functions for:
  - accounts
  - contacts
  - shipments
  - shipment references
  - containers
  - milestones
  - documents
  - shipment exceptions
  - logistics notifications
  - message logs and chat threads with logistics phrasing
  - handoff tickets
  - agent runs / tasks for logistics
- add a seed profile named `logistics_demo`
- ensure generated message examples cover:
  - tracking
  - ETA
  - customs
  - docs pending
  - delay
  - billing dispute
  - explicit human request

### Acceptance criteria

- the app can start with synthetic logistics data only
- the `logistics_demo` profile can be loaded repeatedly
- a basic control-tower payload can be built from synthetic logistics data

## Phase 2: Build logistics repositories and snapshot logic

### Goal

Create stable read/write helpers before agent orchestration and UI.

### Tasks

- add a logistics repository layer
- add helpers:
  - `find_contact_by_phone`
  - `find_shipments_for_account`
  - `find_shipment_by_reference`
  - `latest_milestone_for_shipment`
  - `documents_for_shipment`
  - `exceptions_for_shipment`
  - `open_handoffs`
- add `logistics/status_engine.py`
- add `logistics/snapshots.py`
- create a canonical shipment snapshot builder with fields:
  - identity
  - ownership
  - status
  - latest milestone
  - next expected step
  - exception summary
  - data freshness
  - docs summary

### Acceptance criteria

- one call can produce a deterministic snapshot for any shipment
- the same snapshot object can be reused by:
  - the dashboard
  - the handoff desk
  - the WhatsApp agent

## Phase 3: Build message understanding for logistics

### Goal

Build a logistics conversation engine for WhatsApp and related message channels.

### Tasks

- add a reference extraction module
- add an intent classification module
- implement `/api/communication/mock-whatsapp/send` so it:
  - stores inbound message
  - resolves contact/account
  - extracts references
  - identifies logistics intent
  - attaches `shipment_id` when resolvable
  - creates a `handoff_ticket` if escalation is needed
- update `message_logs.created_records` semantics to logistics records:
  - `shipment_id`
  - `handoff_ticket_id`
  - `exception_id`
  - `notification_id`

### Clarification behavior

Allow one clarification turn before escalation for cases like:

- "Where is my shipment?"
- contact has 2 recent active shipments
- system asks: "I found two active shipments for your account. Please send container number or booking number."

If the user still does not disambiguate, escalate.

### Acceptance criteria

- inbound logistics messages create shipment-aware records only
- message logs capture `contact_id`, `account_id`, `shipment_id`, and resolved references

## Phase 4: Replace agent reply orchestration

### Goal

Use structured logistics facts and safe escalation rules for customer-visible answers.

### Tasks

- add an agent orchestration module
- modify `_call_openai_agent(...)` usage so the LLM receives:
  - message text
  - resolved contact/account
  - authorized shipment list or exact shipment snapshot
  - allowed answer policies
  - escalation policy
- require structured JSON response with:
  - action
  - intent
  - reply_text
  - reply_confidence
  - handoff_required
  - handoff_reason
- do not allow the LLM to look up raw data itself
- all data lookup must happen in Python before the prompt is built

### Direct-answer handlers to implement

- tracking status
- ETA request
- milestone request
- document status
- customs status
- delay reason when a deterministic exception exists

### Escalation categories to implement

- `reference_ambiguity`
- `authorization_failure`
- `no_data`
- `stale_data`
- `customs_hold`
- `billing_or_finance`
- `claim_or_damage`
- `human_requested`
- `low_confidence`

### Acceptance criteria

- the same inbound message always yields a deterministic answer or escalation given the same data
- agent responses cite shipment facts from normalized snapshots
- unclear or risky cases are handed off instead of guessed

## Phase 5: Build the logistics control tower payload

### Goal

Build logistics operations queues and control-tower summaries.

### Tasks

- build control-tower payload logic with logistics metrics:
  - active shipments
  - delayed shipments
  - customs holds
  - stale shipment feeds
  - auto-resolved conversations
  - open handoffs
  - SLA breaches
- define logistics queues:
  - `tracking_queue`
  - `exceptions_queue`
  - `docs_pending_queue`
  - `handoff_queue`
  - `at_risk_shipments`
  - `recent_agent_runs`

### Agent roles for control tower

Use these specialist agent roles:

- `agent_intake`
- `agent_tracking`
- `agent_documents`
- `agent_exception`
- `agent_notifications`

### Acceptance criteria

- control tower clearly shows what the bot handled and what humans still need to own

## Phase 6: Build frontend domain language and section UIs

### Goal

Make the application visibly read as a logistics product.

### Tasks

- implement navigation and copy for logistics mode
- add logistics API bindings
- build the section components listed earlier
- add chips, badges, and labels for logistics intents and statuses

### Specific UI rewrites

#### `Control Tower`

- top KPI row:
  - active shipments
  - delayed shipments
  - customs holds
  - auto-resolved conversations
  - open human handoffs
  - stale data alerts
- workboard:
  - top at-risk shipments
  - top escalations
  - recent agent decisions

#### `Handoff Desk`

- columns:
  - new handoffs
  - assigned
  - awaiting customer
  - resolved
- ticket details:
  - customer
  - shipment reference
  - reason
  - SLA clock
  - suggested reply draft
  - last milestone

#### `Shipments`

- shipment table with filters:
  - account
  - movement type
  - mode
  - status
  - risk
  - ETA window
- right-side detail panel:
  - identifiers
  - timeline
  - docs
  - exceptions

#### `Notifications`

- campaign types:
  - milestone reached
  - delayed shipment update
  - document reminder
  - customs cleared

### Acceptance criteria

- a user opening the app should not see any non-logistics domain language

## Phase 7: Add provider integration boundaries

### Goal

Prepare for real client data ingestion.

### Tasks

- create a provider adapter interface:
  - `fetch_shipments`
  - `fetch_milestones`
  - `fetch_documents`
  - `fetch_exceptions`
  - `sync_incremental`
- create import route or scheduled sync route
- normalize upstream status codes into internal status engine
- persist `source_system`, `source_ref`, and `last_synced_at`

### Important implementation rule

Do not let the dashboard or agent prompt consume raw external payloads directly.

All external records must be normalized into:

- `shipments`
- `containers`
- `shipment_milestones`
- `shipment_documents`
- `shipment_exceptions`

## File-by-File Build Checklist

## Backend

### Seed module

- add `logistics_demo` profile entry
- delegate to the logistics seed generator
- keep the seed layer deterministic

### Logistics seed generator

- create logistics dataset generator
- create realistic WhatsApp messages and shipment states

### API entrypoint

- register logistics route groups
- route communication endpoints to the logistics-aware message pipeline
- keep route handlers thin

### Repository layer

- centralize logistics record lookup and mutation

### Reference extraction layer

- deterministic extraction of container / booking / BL references

### Intent classification layer

- logistics intent classification

### Status engine

- raw event -> normalized customer-safe status

### Snapshot builder

- canonical shipment snapshot builder for UI and agent use

### Agent orchestration

- logistics answer generation
- escalation decisioning

### Escalation routing

- owner routing and SLA calculation

## Frontend

### Navigation and copy layer

- define nav items and section copy

### Frontend app shell

- wire shipment, customer, tracking, handoff, and notification handlers

### Frontend API layer

- add logistics endpoints
- keep communication routes because WhatsApp remains the main interaction surface

### Section composition layer

- compose the dashboard from section components rather than one large file

### Layout shell

- add product title and section-specific branding

### Styles layer

- add status colors for logistics:
  - on-time
  - delayed
  - hold
  - docs pending
  - delivered

## Suggested Delivery Order for Another Agent

Implement in this order:

1. Add `logistics_demo` seed profile and logistics synthetic dataset.
2. Add logistics repositories, status engine, and shipment snapshot builder.
3. Add logistics message intent and reference extraction.
4. Swap `/api/communication/mock-whatsapp/send` to a logistics-aware pipeline in logistics mode.
5. Build the logistics control tower payload and basic logistics endpoints.
6. Update `api.js`, `theme.js`, and `App.jsx` loader map.
7. Extract and build `ControlTowerSection`, `ShipmentsSection`, `CustomersSection`, and `CustomerChatSimulatorSection`.
8. Build `HandoffDeskSection` and `CommunicationBoardSection` so the escalations-only and all-messages views are distinct.
9. Add `NotificationsSection` and `DocsComplianceSection`.
10. Add provider adapter boundary, sync routes, and tests.

## Testing Plan

## Unit tests

- reference extraction
- shipment resolution by reference
- authorization checks
- normalized status mapping
- escalation classification
- reply policy decisioning

## Integration tests

- inbound WhatsApp tracking message -> direct answer
- inbound ETA question with stale data -> handoff
- inbound customs hold question -> handoff
- inbound ambiguous shipment question -> clarification then handoff
- inbound explicit human request -> handoff
- notification send -> thread log update

## UI tests

- control tower loads logistics KPIs
- shipment detail panel shows milestones, docs, exceptions
- handoff desk shows only human-required tickets
- customer thread shows auto-resolved and handed-off messages correctly

## Demo scenarios to seed

At minimum seed these synthetic scenarios:

1. clean in-transit shipment that can be auto-answered
2. shipment with customs hold requiring human handoff
3. shipment with stale milestone feed requiring safe fallback
4. customer with two active shipments causing clarification flow
5. delayed shipment with deterministic delay reason
6. document-pending shipment where the answer identifies customer-side pending docs

## KPI Definitions

Track these in logistics mode:

- `auto_resolution_rate`
- `human_handoff_rate`
- `average_first_response_seconds`
- `average_handoff_resolution_seconds`
- `stale_data_ticket_count`
- `shipments_at_risk_count`
- `delayed_shipments_count`
- `customs_hold_count`
- `documents_pending_count`

## Non-Negotiable Guardrails

1. Do not let the LLM invent shipment facts.
2. Do not answer customer questions without shipment ownership validation.
3. Do not auto-answer disputes, claims, customs holds, or finance issues.
4. Always show last updated time in customer-facing status answers.
5. Keep human handoff as a first-class queue, not an afterthought.
6. Preserve auditability of every automated answer and escalation decision.

## Scope for First Build

### In scope

- logistics synthetic dataset
- logistics dashboard terminology and sections
- shipment tracking and milestone answering
- handoff desk for escalations
- proactive notifications
- deterministic reference extraction
- structured reply generation

### Out of scope for first pass

- real WhatsApp provider integration
- real shipping line APIs
- OCR / document parsing
- billing reconciliation
- multi-tenant auth
- production database migration

These can be added after the logistics mode proves the workflow.

## Final Implementation Note

The fastest successful path is not "replace everything at once." The fastest successful path is:

- keep the communication pattern centered on inbound messages, structured answers, and handoff
- replace the domain model under it with shipments, milestones, exceptions, and customers
- make WhatsApp the operational front door
- answer only from normalized shipment facts
- surface all uncertainty through a strong human handoff desk

If another agent follows this plan in order, they can build a logistics customer-service control tower that combines automation, shipment visibility, conversation traceability, and explicit escalation handling in a way that is suitable for demo validation and later production hardening.
