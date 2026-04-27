# FPO Integrated OS POC

React + Flask proof of concept built from:

- `understanding.md`
- `dev-plan.md`
- `data-and-effort-required.md`
- `DESIGN_LANGUAGE.md`
- `mock-whatsapp-module.md`

The app demonstrates an integrated FPO operating platform with synthetic data across:

- Registry
- Operations
- Market linkage
- Communication simulation
- Carbon readiness
- KPI reporting

It includes action workflows, a guided demo runner, and agent-style communication flows.

## Non-Technical Demo Experience

- `Step-by-Step Flow` tab: a sequential tutorial where users must complete each step to unlock the next.
- Simplified action forms with human-readable dropdowns so nobody needs to memorize IDs.
- Dedicated `Mock WhatsApp` tab with:
  - farmer-side phone UI simulation
  - FPO office receiver queue and reply console
  - shared live conversation thread

## Tech Stack

- Frontend: React + Vite
- Backend: Flask + Flask-CORS
- Data: deterministic synthetic in-memory dataset generator with persisted demo snapshots in `backend/runtime_dataset.json`

## Project Structure

- `backend/app.py`: Flask API server
- `backend/data_seed.py`: synthetic data generator and dashboard calculators
- `frontend/src/App.jsx`: module views and API wiring
- `frontend/src/index.css`: design language implementation
- `frontend/src/theme.js`: navigation and section copy
- `render.yaml`: Render Blueprint for static frontend + backend web service
- `RENDER_DEPLOY.md`: step-by-step Render deployment guide

## Run Backend

```bash
cd backend
python -m pip install -r requirements.txt
python app.py
```

Backend runs on `http://127.0.0.1:5000`.

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://127.0.0.1:5173` and proxies `/api/*` to the Flask backend.

## Available API Groups

- `/api/health`
- `/api/dashboard/summary`
- `/api/lookups`
- `/api/registry/*`
- `/api/operations/*`
- `/api/market/*`
- `/api/communication/*`
- `/api/communication/mock-whatsapp/*`
- `/api/carbon/*`
- `/api/reports/kpis`
- `/api/demo/*`
- `/api/admin/seed`

## Deploy On Render

This repo is set up for:

- `fpo-poc-frontend` as a Render `Static Site`
- `fpo-poc-backend` as a Render `Web Service`

Use the root `render.yaml` Blueprint and follow `RENDER_DEPLOY.md`.

An optional GitHub Actions keep-alive workflow is included at `.github/workflows/render-keepalive.yml`.

## Verified During Build

- Python syntax check on backend modules
- Flask test-client checks for create/approve/send/demo action endpoints
- Frontend production build with `npm run build`

## Notes

- This is a POC. Intelligence outputs are rules and synthetic scenarios, not production ML.
- Agent calls use the backend service's `OPENAI_API_KEY`; the frontend does not need that secret.
- Demo login is verified by the backend and uses a signed bearer token. On Render, keep `FPO_AUTH_SECRET` and any `FPO_DEMO_USERS` override on the backend service only.
- Backend CORS is limited to local development and the configured Render frontend origin.
- On Render free web services, local filesystem changes are not durable across spin-downs or redeploys.
- If you enable the keep-alive workflow, the backend will stay warm but will use nearly all of the free monthly instance hours for that workspace.
