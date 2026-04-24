# App Interlink Gap Report

Date: 2026-04-15

Note: This document is the original audit snapshot. The gaps listed here were remediated in code later on 2026-04-15 and are retained as a historical record of what was fixed.

## Scope

This audit reviews how app writes propagate across the non-carbon parts of the product:

- `Registry`
- `Farmer Chat`
- `Operations`
- `Market`
- `Communication`
- `Governance`

Per request, `Carbon` is excluded from the strict interlinking requirement.

The audit covers:

- frontend refresh wiring in `frontend/src/App.jsx`
- section data dependencies in `frontend/src/sectionViews.jsx`
- API and mutation behavior in `backend/app.py`

## What Is Already Linked Well

- `Produce Collection -> Market + Settlements` is wired correctly. A collection creates or reuses a settlement and the frontend refreshes both `operations` and `market`. Evidence: `backend/app.py:2172-2205`, `frontend/src/App.jsx:354-360`.
- `Sales Order -> Collections + Buyer Demand + Governance` is mostly wired. Creating a sales order updates linked collections and buyer-demand status, and the frontend refreshes `market`, `operations`, and `governance`. Evidence: `backend/app.py:2339-2419`, `frontend/src/App.jsx:372-378`.
- `Sales Order Paid -> Settlements + Governance` is wired. Buyer payment generates settlement-release approvals and the frontend refreshes `market`, `operations`, and `governance`. Evidence: `backend/app.py:2460-2480`, `frontend/src/App.jsx:390-396`.
- `Input Issue -> Demand Status + Inventory` is wired inside `Operations`. Evidence: `backend/app.py:2092-2162`, `frontend/src/App.jsx:345-351`.

## Findings

### 1. Governance approvals are non-operative

Severity: High

The governance approval action updates only the approval log row. It does not mutate the underlying business entity that the approval refers to.

Evidence:

- The Governance UI presents approvals as actionable workflow items: `frontend/src/sectionViews.jsx:1488`
- The approval API only changes `approval_logs.status`, `decision_by`, `decision_at`, and `notes`: `backend/app.py:2768-2785`

Impact:

- Approving a `settlement_release` approval does not release or advance any settlement.
- Approving a `sales_order` approval does not change the sales order.
- Approving a `large_input_issue` approval does not alter the input issue.
- The UI makes approvals look transactional, but they are currently just metadata edits.

Gap:

- `Governance` is not truly interlinked with the operational entities it claims to control.

Recommended fix:

- Route approval decisions through entity-specific handlers.
- Use `approval.entity` and `approval.entity_id` to trigger the actual state transition.
- Keep `approval_logs` as audit/decision history, not as the only side effect.

### 2. Disease-case assignment and communication ticket state can diverge

Severity: High

Disease escalations are stored in `disease_logs` and `escalations`, but the visible communication boards are driven from `message_logs`. The disease assignment flow updates one side of that split but not the other.

Evidence:

- Disease query creation writes `disease_logs` plus an escalation row without `message_id`, `category`, or `reason`: `backend/app.py:1214-1233`
- Disease assignment updates `disease_logs.escalated` and `escalations.owner/status`: `backend/app.py:1512-1542`
- Communication status updates operate on `message_logs` and mirrored `chat_threads` only: `backend/app.py:1810-1845`
- The Communication board derives escalation display from inbox/message rows, not from the escalation dataset: `frontend/src/sectionViews.jsx:1025-1039`, `frontend/src/sectionViews.jsx:1124-1141`

Impact:

- A disease case can be assigned or closed in `Communication`, while the corresponding ticket still shows old status in the board.
- Owner/status in escalation records can drift away from what the user sees on the main ticket board.
- The app has two sources of truth for the same escalation lifecycle.

Recommended fix:

- Add a hard link from disease escalations to `message_logs` using `message_id`.
- When assigning or closing a disease case, also update the linked message row.
- Make the board render from a single normalized escalation view rather than partial `message_logs` fields.

### 3. Chat-originated requests do not reconcile back from Operations to Communication

Severity: High

Farmer-chat requests create operational records, but the later operational steps do not reconcile back to the originating conversation.

Evidence:

- Chat-created input demands store `source_ref` to the original message: `backend/app.py:1159-1195`
- Demand approve/reject updates only the demand row: `backend/app.py:1862-1909`
- Demand aggregation updates only demand statuses: `backend/app.py:1911-1956`
- Input issue closes demand rows by setting them to `issued`, but does not update or resolve the source ticket: `backend/app.py:2092-2162`
- Office reply and status changes are separate communication-only flows: `backend/app.py:1285-1342`, `backend/app.py:1810-1845`

Impact:

- A farmer request can be approved, aggregated, procured, or issued in `Operations` while still looking pending in `Farmer Chat` and `Communication`.
- Teams have to manually synchronize the conversation after the work is already done.
- The app has the data needed to link the workflow, but it is not using it.

Recommended fix:

- Use `input_demands.source_ref` to update the linked `message_logs` row when the demand is approved, rejected, or fully issued.
- Optionally auto-create an office response when the request is fulfilled or rejected.
- Add a communication status policy for operational transitions so the ticket board reflects real-world progress.

### 4. Communication actions do not refresh Governance even though they write audit history

Severity: Medium

Most communication actions append audit entries in the backend, but the frontend does not refresh the `governance` section after those actions.

Evidence:

- Communication actions refresh `communication`, `whatsapp`, and sometimes `operations`, but not `governance`: `frontend/src/App.jsx:408-430`, `frontend/src/App.jsx:477-509`
- The backend appends audits for broadcast creation, broadcast read ack, disease assignment, office replies, agent replies, and message status updates: `backend/app.py:1541`, `backend/app.py:1626`, `backend/app.py:1655`, `backend/app.py:1704`, `backend/app.py:1740-1755`, `backend/app.py:1845`, `backend/app.py:1341`

Impact:

- If `Governance` is already loaded, its audit timeline goes stale after communication work.
- The audit trail is not reliably interlinked with active communication workflows.

Recommended fix:

- Add `governance` to the refresh list for communication write handlers.

### 5. New farmer onboarding does not fully propagate to tabs that consume lookups

Severity: Medium

Creating a farmer updates the registry-side datasets, but the frontend only refreshes `registry` and `governance`. Tabs that depend on `lookups()` stay stale if they were already loaded.

Evidence:

- Farmer creation updates `farmers`, `fpos.members_count`, `communication_profiles`, `plots`, and `crop_seasons`: `backend/app.py:959-1018`
- The frontend refreshes only `registry`, `dashboard`, `reports`, and `governance`: `frontend/src/App.jsx:264-270`
- `Farmer Chat`, `Operations`, and `Communication` all depend on `lookups()` for farmer-based selectors and audience building: `frontend/src/App.jsx:110-167`, `frontend/src/sectionViews.jsx:394-398`, `frontend/src/sectionViews.jsx:777`, `frontend/src/sectionViews.jsx:1005-1010`

Impact:

- A newly created farmer may not appear in the Farmer Chat selector, operations forms, or communication broadcast audience options until those tabs are manually reloaded.

Additional master-data gap:

- `create_farmer` does not append the new village into `DATASET["villages"]`, while Registry geographies are served from the village master list, not from farmers: `backend/app.py:992-1016`, `backend/app.py:1464-1469`

Impact:

- A farmer can exist in a new village that appears in lookup-derived UI but not in the Registry geographies master table.

Recommended fix:

- Refresh `whatsapp`, `operations`, and `communication` after farmer creation.
- Update village master data when onboarding introduces a new village, or make geographies derive from the same source as lookups.

### 6. Broadcast preview count in the UI can differ from actual recipients

Severity: Medium

The frontend preview count uses only `fpo_id` and `village`, but the backend applies `fpo_id`, `village`, `crop`, `language`, and WhatsApp opt-in.

Evidence:

- Frontend preview logic: `frontend/src/sectionViews.jsx:1041-1045`
- Backend recipient selection logic: `backend/app.py:1552-1580`

Impact:

- The UI can overstate or understate broadcast reach before send.
- Users can see a preview audience that does not match the broadcast that is actually created.

Recommended fix:

- Reuse the backend filter rules in the frontend preview, or expose a dedicated preview endpoint and render from backend-calculated recipients.

### 7. Broadcast simulate-reply is inconsistent with the live YES flow

Severity: Medium

The manual broadcast read-simulation endpoint and the real farmer YES flow update different datasets.

Evidence:

- Manual simulation updates `broadcast_recipients`, `broadcasts.read_count`, and appends one `chat_threads` row: `backend/app.py:1665-1705`
- Real YES through WhatsApp send creates a `message_log`, re-tags the intent to `broadcast_ack`, marks read, and sends an office reply: `backend/app.py:1720-1765`

Impact:

- Manual simulation does not create the same audit trail and communication artifacts as real traffic.
- Broadcast metrics update, but inbox totals and conversation history do not behave the same way between the two paths.

Recommended fix:

- Make simulate-reply call the same core routine as the live YES flow, or document it clearly as a lightweight metric-only shortcut.

### 8. The escalation dataset is fetched but effectively not rendered

Severity: Medium

Both `Farmer Chat` and `Communication` loaders fetch escalation data, but the main boards are rendered from inbox/message rows rather than from `sectionData.escalations`.

Evidence:

- Escalations are fetched for both tabs: `frontend/src/App.jsx:110-118`, `frontend/src/App.jsx:156-167`
- `WhatsAppDemoSectionV2` reads `sectionData.escalations` but does not use it to drive the board: `frontend/src/sectionViews.jsx:397`
- `CommunicationSection` renders escalation mode by filtering `inboxAll` on `row.escalated`: `frontend/src/sectionViews.jsx:1025-1039`

Impact:

- Escalation records can drift without the UI showing the authoritative escalation state.
- Extra network calls are being spent on data the main workflows do not trust.

Recommended fix:

- Either normalize the UI around the escalation dataset, or stop fetching it and make `message_logs` the single source of truth.

### 9. Removed Dashboard/KPI tabs still participate in refresh dependencies

Severity: Low

The app still refreshes hidden `dashboard` and `reports` loaders after most writes even though those tabs were removed from navigation.

Evidence:

- Dashboard and reports loaders still exist: `frontend/src/App.jsx:103-185`
- Most write handlers still refresh `dashboard` and `reports`: `frontend/src/App.jsx:264-509`

Impact:

- Extra network work happens after nearly every mutation.
- Dependency lists are noisy, which makes true cross-tab linkage harder to reason about.

Recommended fix:

- Remove `dashboard` and `reports` from the refresh graph unless they are still intentionally used in a hidden capacity.

## Priority Fix Order

1. Make governance approvals transactional.
2. Unify escalation state across `message_logs`, `escalations`, and disease cases.
3. Reconcile chat-originated operational records back to communication tickets.
4. Refresh `governance` after communication writes.
5. Refresh lookup-consuming tabs after farmer creation and fix village master drift.
6. Normalize broadcast preview and simulate-reply behavior.
7. Remove dead dashboard/report refresh coupling.

## Bottom Line

The strongest interlinking today is `Operations <-> Market`, especially around collections, sales orders, dispatches, and settlements.

The weakest interlinking is:

- `Governance <-> actual workflow state`
- `Communication <-> disease/escalation state`
- `Communication <-> Operations` for chat-originated requests

Those are the main gaps preventing the non-carbon tabs from behaving like one connected operating system.
