# FPO POC Implementation Audit

Audited against `poc-gap-audit.md` recommendations. SQLite/persistence items excluded per scope.

## Implemented (done)

### P0 #1 — Expose `execution` and `registry` in nav
- Both in `NAV_ITEMS` in `theme.js`
- `execution` is the default active tab
- Both have full data loaders and render functions in `App.jsx`

### P0 #2 — Connected operating workflow
All backend routes exist:
- `POST /api/operations/demands/aggregate`
- `POST /api/operations/input-issues`
- `POST /api/operations/produce-collections`
- `POST /api/operations/settlements/generate`
- `POST /api/market/sales-orders`
- `POST /api/market/dispatches`
- `POST /api/market/sales-orders/<id>/mark-paid`
- `GET /api/operations/inventory-transactions`

All frontend handlers exist:
- `handleAggregateDemands`
- `handleCreateInputIssue`
- `handleCreateProduceCollection`
- `handleGenerateSettlements`
- `handleCreateSalesOrder`
- `handleCreateDispatch`
- `handleMarkSalesOrderPaid`

### P0 #3 — Role-based access and approvals
- Role switcher in top bar with all 6 roles: Super Admin, FPO Admin, Field Coordinator, Operations User, Sales User, Viewer
- `ROLE_ACTIONS` map enforces permissions at every handler with `ensurePermission()`
- Backend has `ROLE_PERMISSIONS` and `_require_permission()` enforcement on sensitive routes
- `POST /api/admin/approvals/<id>/decide` exists
- `GET /api/admin/approval-logs` and `GET /api/admin/audit-logs` exist
- Approval queue and audit timeline rendered in Reports section

---

## Missing

### Carbon (Section E) — entirely read-only, no action workflows

| Item | Status |
|------|--------|
| `POST /api/carbon/practices` | Missing — carbon backend is GET-only |
| `GET /api/carbon/estimates` | Missing |
| `POST /api/carbon/projects/<id>/advance` | Missing |
| Readiness scoring fields (plot coverage %, practice completeness %, farmer participation %) | Missing |
| Practice logging form in UI | Missing — `CarbonSection` is two read-only tables |
| Project detail drawer (area, farmers, practices, credits, stage) | Missing |
| "Why this project is carbon-ready" breakdown | Missing |

### Governance section — data loaded but nothing rendered

| Item | Status |
|------|--------|
| `governance` section loader exists and fetches approvals, audits, adminRoles | Done |
| `GovernanceSection` render component | Missing — switch falls to `default: return null` |
| Dedicated governance nav tab | Missing from `NAV_ITEMS` |

### Communication (Section B) — simulator only, no broadcast or disease workflow

| Item | Status |
|------|--------|
| `POST /api/communication/broadcasts` | Missing |
| `GET /api/communication/disease-cases` | Missing |
| `POST /api/communication/disease-cases/<id>/assign` | Missing |
| Broadcast composer with crop/village/FPO/language filters | Missing |
| Disease case review screen with image, suggested issue, assigned owner | Missing |
| Case detail panel | Missing |
| Communication analytics (response SLA, unresolved count, campaign ack rate) | Missing |
| Targeted messaging by segment | Missing |

### Reporting (Section F) — KPIs only, no exports or drilldowns

| Item | Status |
|------|--------|
| Export endpoints (CSV/JSON) | Missing — no export routes in backend |
| Report aggregations (by village, procurement status, inventory movement, etc.) | Missing |
| Export buttons in UI | Missing — `ReportsSection` has no export controls |
| KPI drilldowns from stat cards to report tables | Missing |
| Traceability reports | Missing |
| Settlement ageing report | Missing |
| Buyer/supplier performance reports | Missing |
| Carbon readiness report | Missing |
| Audit report export | Missing |

### Market (Section D) — commerce execution incomplete

| Item | Status |
|------|--------|
| Buyer demand board as first-class view | Missing — demands are counted, not rendered as a board |
| Price comparison card (mandi vs buyer vs hold) | Missing |
| Quality-grade-aware matching | Missing |
| Geography/logistics-aware matching | Missing |
| Buyer reliability and payment terms weighting in matching | Missing |

### Registry (Section A) — read-only, no CRUD

| Item | Status |
|------|--------|
| FPO create/update endpoints and UI | Missing — no FPO CRUD |
| Farmer detail page / drawer | Missing |
| Farmer update endpoint and UI | Missing |
| Plot CRUD | Missing — read-only |
| Season CRUD | Missing — read-only |
| Communication profile UI | Missing — data loads but no UI |
| Map / GeoJSON polygon visualization | Missing |
| Onboarding approval state for farmers | Missing |

### Architecture

| Item | Status |
|------|--------|
| Frontend module split (registry/, operations/, market/, carbon/ folders) | Not done — single `App.jsx` monolith |
| Backend blueprint/service split | Not done — single `app.py` |
| Validation layer (Pydantic or Marshmallow) | Missing |
| Backend test suite | Missing |
| Frontend smoke tests | Missing |

---

## Partially done — needs verification

| Item | Notes |
|------|-------|
| Operations workflow screens | `inventoryTransactions` and `collections` are loaded into the operations section — unclear if rendered as workflow panels or passive tables |
| State transition linking | Routes exist for `aggregate`, `issue`, `collect` — unclear if `input_demand_ids` on PRs and `collection_ids` on sales orders are actually stored and linked |

---

## Priority order for remaining work

1. **Governance section** — data already loaded, just needs a render component and nav tab. Lowest effort, high demo impact.
2. **Carbon action workflows** — add `POST /api/carbon/practices` and `POST /api/carbon/projects/<id>/advance`, add practice logging form and project detail drawer.
3. **Market — buyer demand board and price comparison card** — high commercial demo value.
4. **Communication — broadcast composer** — differentiates the product, route additions are small.
5. **Registry CRUD** — farmer detail and update at minimum; FPO and plot CRUD as follow-on.
6. **Reporting exports** — CSV export routes and buttons in UI.
7. **Architecture decomposition** — split `App.jsx` and `app.py` once features are stable.
