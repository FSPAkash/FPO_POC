# Render Deploy Guide

This repo is ready to deploy on Render as:

- a free `Static Site` for the React frontend
- a free `Web Service` for the Flask backend

The simplest path is to let Render read the repo's root `render.yaml` Blueprint after you connect GitHub.

## What Is Already Wired

- `render.yaml` defines both Render services from this monorepo.
- The frontend reads `VITE_API_BASE_URL` at build time.
- The Blueprint fills `VITE_API_BASE_URL` automatically from the backend service's `RENDER_EXTERNAL_URL`.
- The backend is set up to run in production with `gunicorn`.
- The OpenAI key stays server-side on the backend only.
- `.github/workflows/render-keepalive.yml` can ping the backend every 10 minutes from GitHub Actions if you choose to keep it warm.

## What You Need

- A GitHub repo containing this project.
- A Render account.
- Your OpenAI API key for backend agent features.

## Recommended Deploy Flow

1. Push this repo to GitHub.
2. In Render, click `New` -> `Blueprint`.
3. Connect your GitHub account if Render has not been authorized yet.
4. Select this repository.
5. Render will detect `render.yaml` and show two services:
   - `fpo-poc-backend`
   - `fpo-poc-frontend`
6. When Render prompts for secret values, paste your `OPENAI_API_KEY`.
7. Leave `OPENAI_AGENT_MODEL` as the default unless you want a different model.
8. Click `Apply`.
9. Wait for the backend build to finish, then the frontend build.
10. Open the frontend `onrender.com` URL and use the app normally.
11. Optional: turn on the GitHub Actions keep-alive by setting the repo variable `RENDER_BACKEND_HEALTH_URL` to your backend health URL, such as `https://your-backend.onrender.com/api/health`.

## Manual Values If Render Asks

If you ever create the services manually instead of using the Blueprint:

### Backend web service

- Root directory: `backend`
- Runtime: `Python`
- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app`
- Health check path: `/api/health`
- Environment variables:
  - `OPENAI_API_KEY` = your key
  - `OPENAI_AGENT_MODEL` = `gpt-5.2` (optional)

### Frontend static site

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `frontend/dist`
- Environment variables:
  - `VITE_API_BASE_URL` = your backend public URL, for example `https://your-backend.onrender.com`
- Rewrite rule:
  - source: `/*`
  - destination: `/index.html`
- Do not set `plan: free` for the static site in `render.yaml`. In Render's current Blueprint validation, the frontend static site should omit the `plan` field entirely.

## Important Notes

- Do not put `OPENAI_API_KEY` on the frontend static site.
- The app's mutable demo state is stored in `backend/runtime_dataset.json`.
- Render free web services have an ephemeral filesystem.
- That means data changes can be lost when the backend spins down, restarts, or redeploys.
- For this POC, that is acceptable, but it is not durable storage.
- Free web services also cold-start after idle time on Render's free tier.
- If you enable keep-alive, your backend will stay awake almost all month and consume roughly `720` hours in a 30-day month or `744` hours in a 31-day month.
- Render grants `750` free instance hours per workspace per calendar month, so enabling keep-alive leaves almost no buffer for any other always-on free web service in that same workspace.

## Optional GitHub Keep-Alive Setup

This repo includes a GitHub Actions workflow at `.github/workflows/render-keepalive.yml`.

It:

- runs every 10 minutes
- calls your backend `/api/health` endpoint
- does nothing until you set the repository variable

To enable it:

1. Open your GitHub repository.
2. Go to `Settings` -> `Secrets and variables` -> `Actions`.
3. Open the `Variables` tab.
4. Add a new repository variable named `RENDER_BACKEND_HEALTH_URL`.
5. Set its value to your backend health endpoint, for example `https://your-backend.onrender.com/api/health`.
6. Open the `Actions` tab and run `Render Keep Alive` once with `Run workflow` if you want to test immediately.

If you do not want to keep the backend awake anymore, delete that repository variable or disable the workflow.

## After The First Deploy

- To confirm the backend is healthy, open `https://your-backend.onrender.com/api/health`.
- To confirm agent mode is configured, open `https://your-backend.onrender.com/api/communication/agent-config`.
- If you later add a custom frontend domain, keep the Blueprint or manually update `VITE_API_BASE_URL` to the backend's public URL and redeploy the frontend.
