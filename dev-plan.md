# React + Flask POC Development Plan

## Objective
Build a React + Flask proof of concept that demonstrates an integrated FPO digital operating platform using synthetic data. The POC should validate workflow design, data architecture, and business usefulness before we spend effort on live integrations and viable production data.

## POC Product Goal
The POC should answer one question clearly:

Can we show that a single platform can connect FPO registry, operations, market linkage, and carbon readiness in a way that is visibly more useful than disconnected tools?

## Recommended POC Scope
### Included
- FPO registry and geography hierarchy
- farmer, plot, and crop season master data
- operations workflows for demand, procurement, inventory, collection, and settlement
- market price and buyer workspace
- carbon practice tracking and carbon aggregation view
- role-based access and approvals
- dashboards and reports
- synthetic advisory and chat simulation

### Excluded in POC
- real WhatsApp API integration
- real satellite pipeline
- real disease model training
- live mandi, weather, buyer, or carbon APIs
- production authentication stack with enterprise SSO
- deep multilingual voice processing

## Product Strategy for the POC
The notes suggest a large roadmap. For the POC, we should compress it into a coherent demo journey:

1. An FPO admin sees registered members, plots, and crop seasons.
2. The system shows farmer demand captured from a simulated communication channel.
3. The FPO aggregates demand, raises purchase requests, receives stock, and issues inputs.
4. The FPO records produce collection, views buyer opportunities, and creates a sales order.
5. The system shows settlement visibility and price improvement scenarios.
6. The system shows climate-practice tracking and a carbon-ready aggregation dashboard.

This gives reviewers one end-to-end story instead of five disconnected screens.

## Proposed User Roles
- Super Admin: configures geography, demo data, and system defaults.
- FPO Admin: approves requests, monitors operations, reviews dashboards.
- Field Coordinator: manages farmer onboarding, plot updates, collection records, practice logs.
- Operations User: handles procurement, inventory, dispatch, and settlement entry.
- Sales User: manages buyers, demand matching, and sales orders.
- Viewer: read-only investor, partner, or internal review account.

## Functional Modules
### Module A: Registry Foundation
Screens:

- geography and FPO directory
- farmer list and detail
- plot list with simple polygon or GeoJSON display
- crop season records
- communication profile

Backend capabilities:

- CRUD APIs for FPO, farmer, plot, season
- filtering by geography, crop, season, irrigation type
- relationship validation

### Module B: Communication and Advisory Simulator
Screens:

- chat inbox simulator
- broadcast composer
- advisory history
- escalation queue

Backend capabilities:

- synthetic inbound message generator
- intent classification by rule
- advisory template engine
- message and escalation logging

Note:
This is a simulation layer in the POC, not a real WhatsApp connector.

### Module C: Operations Engine
Screens:

- demand aggregation dashboard
- purchase request and purchase order screens
- goods receipt and inventory ledger
- farmer input issue form
- produce collection entry
- settlement summary

Backend capabilities:

- demand aggregation logic
- approval workflow
- inventory balance calculation
- settlement calculation
- audit log generation

### Module D: Market Linkage Workspace
Screens:

- mandi price dashboard
- buyer registry
- buyer demand board
- supply-demand matching screen
- sales order and dispatch summary

Backend capabilities:

- synthetic market price feed
- buyer demand generator
- simple matching engine
- deal creation and order status tracking

### Module E: Carbon Readiness Workspace
Screens:

- climate practice log
- farm aggregation map or summary view
- carbon estimate dashboard
- project cluster summary

Backend capabilities:

- practice capture APIs
- rules-based carbon estimate engine
- project aggregation logic
- summary and revenue estimate calculations

## Suggested Technical Architecture
### Frontend
- React
- React Router
- a component library such as MUI or Ant Design for speed
- Recharts or ECharts for dashboards
- TanStack Query for API state
- form library such as React Hook Form for transactional forms

### Backend
- Flask
- Flask-RESTX or standard Flask blueprints for modular APIs
- SQLAlchemy ORM
- Alembic for migrations
- Marshmallow or Pydantic for request and response validation

### Data Layer
For speed in the POC:

- SQLite for local demo simplicity
- GeoJSON stored as text for plot boundaries

For production migration:

- PostgreSQL + PostGIS

### Synthetic Data Layer
- Python-based seeding scripts
- scenario packs by crop cluster and geography
- deterministic fake data generation for repeatable demos

### Deployment
- local first for development
- Docker-ready structure
- later deployable to a small cloud VM or container platform

## Suggested Information Architecture
- `/dashboard`
- `/registry/fpos`
- `/registry/farmers`
- `/registry/plots`
- `/registry/seasons`
- `/communication/inbox`
- `/communication/broadcasts`
- `/operations/demand`
- `/operations/procurement`
- `/operations/inventory`
- `/operations/collection`
- `/operations/settlements`
- `/market/prices`
- `/market/buyers`
- `/market/matching`
- `/carbon/practices`
- `/carbon/projects`
- `/reports`

## Data Model for the POC
### Core master tables
- geographies
- fpos
- farmers
- plots
- crop_seasons
- users
- communication_profiles
- suppliers
- buyers
- inputs_catalog

### Transaction tables
- message_logs
- advisory_logs
- disease_case_logs
- input_demands
- purchase_requests
- purchase_orders
- goods_receipts
- inventory_transactions
- farmer_input_issues
- produce_collections
- sales_orders
- dispatches
- farmer_settlements
- carbon_practices
- carbon_estimates
- carbon_projects

### Support tables
- approval_logs
- audit_logs
- market_prices
- buyer_demands
- notification_templates
- scenario_configs

## Demo Data Design
We should generate realistic synthetic scenarios instead of random fake rows. Recommended baseline:

- 2 states
- 4 districts
- 8 FPOs
- 1,200 to 2,000 farmers
- 2,500 to 4,000 plots
- 3 to 5 major crops
- 2 crop seasons
- 500 to 1,000 input demand records
- 100 to 250 purchase and inventory transactions
- 300 to 600 produce collection records
- 50 to 100 buyer demand records
- 500 to 1,000 climate practice records

Suggested crop clusters:

- onion
- tomato
- soybean
- cotton
- pomegranate

## Recommended Build Sequence
### Phase 0: Project setup
- create React and Flask app skeletons
- define folders, API contracts, and base theme
- set up database, migrations, and seed pipeline

### Phase 1: Registry foundation
- build geography, FPO, farmer, plot, and season entities
- create list and detail screens
- seed synthetic master data

Exit criteria:
- all core relationships render correctly
- filtering and detail views work

### Phase 2: Operations backbone
- implement input demand, purchase request, PO, goods receipt, inventory, collection, and settlement flows
- add approval states and audit logs
- build practical dashboards

Exit criteria:
- reviewers can follow one traceable procurement-to-settlement workflow

### Phase 3: Market linkage
- add price dashboard, buyer registry, buyer demand board, and matching screen
- connect available produce to potential deals
- show revenue comparison scenarios

Exit criteria:
- reviewers can see why a specific buyer or market is recommended

### Phase 4: Communication simulation
- add chat inbox and message logs
- simulate price queries, advisory push, input requests, and escalation cases
- connect messages to demand and case records

Exit criteria:
- reviewers can see how interaction data enters the operating layer

### Phase 5: Carbon readiness
- add climate-practice logging
- implement simple carbon estimate rules
- show aggregated project and revenue scenarios

Exit criteria:
- reviewers can see why carbon is a later layer built on earlier data

### Phase 6: POC polish
- refine navigation and dashboard story
- improve charts and data labels
- add seeded demo scenarios and reset data option
- prepare walkthrough script

## API Plan
Suggested Flask blueprint grouping:

- `registry`
- `communication`
- `operations`
- `market`
- `carbon`
- `reports`
- `admin`

Representative endpoints:

- `GET /api/registry/fpos`
- `GET /api/registry/farmers`
- `POST /api/operations/purchase-requests`
- `POST /api/operations/goods-receipts`
- `POST /api/operations/produce-collections`
- `GET /api/market/prices`
- `POST /api/market/buyer-demands`
- `GET /api/market/matching`
- `POST /api/carbon/practices`
- `GET /api/carbon/projects`
- `POST /api/admin/seed`

## Rules Engine vs AI in the POC
The POC should avoid fake sophistication. Use:

- rules for advisory templates
- lookup tables for price and weather responses
- heuristic matching for buyers
- formula-based carbon estimates
- mock confidence scores for disease cases

This is enough to demonstrate product logic without overcommitting on production AI claims.

## UX Principles
- Make the app admin-first and workflow-first.
- Keep forms short and operational.
- Use dashboards that answer real questions, not vanity metrics.
- Show status, approval, and exception states clearly.
- Make traceability visible across modules.

## Success Criteria for the Build
- The app feels like a connected operating platform, not a collection of mock pages.
- Every module reuses shared entities such as FPO, farmer, plot, season, buyer, and transaction status.
- Synthetic data looks plausible and supports meaningful charts and workflows.
- The demo story can be completed in under 10 minutes with clear business outcomes.

## Risks
- Building too many modules too deeply.
- Spending time on real integrations before approval.
- Generating low-quality synthetic data that makes the app feel fake.
- Overusing AI language where rules and scenario logic are enough.

## Recommendation
For the first POC milestone, the highest-priority slice should be:

- registry foundation
- operations backbone
- market linkage dashboard

Communication simulation and carbon readiness should be added after that because they are valuable but not the strongest proof of enterprise usefulness on day one.
