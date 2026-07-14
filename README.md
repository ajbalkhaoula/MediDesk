# MediDesk

Frontend: React + Vite + TypeScript + Tailwind + shadcn/ui  
Backend: Node.js (Express + TypeScript)  
Database: PostgreSQL (Docker)

## Quick Start (Docker)

```sh
docker compose up --build
```

Apps:
- Frontend: http://localhost:5173
- API: http://localhost:4000
- API health: http://localhost:4000/api/health
- PostgreSQL: localhost:5432

Default database credentials (docker-compose):
- user: `cabortho`
- password: `cabortho`
- database: `cabortho`

Seed login (development):
- email: `admin@cabortho.local`
- password: `Admin12345!`

## Backend Auth Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token required)

## Local (without Docker)

Frontend:
```sh
npm i
npm run dev
```

Backend:
```sh
cd backend
npm i
npm run dev
```

Set environment variables from:
- `.env.example`
- `backend/.env.example`

## Staging Environment (Render + Neon)

A live pre-production environment is deployed from the `feature/consultation` branch for testing before merging to `main`:

- Frontend: https://medidesk-frontend-57a0.onrender.com
- API: https://medidesk-api-p9qg.onrender.com
- Login: `admin@cabortho.local` / `Admin12345!`

Infrastructure:
- **Frontend + API** are deployed on [Render](https://render.com) as a Blueprint defined in `render.yaml` at the repo root (`medidesk-api`: Node web service, root dir `backend`; `medidesk-frontend`: static site, root dir `.`). Render Free plan requires card verification (identity check only, no charge as long as you stay on Free).
- **Database** is hosted on [Neon](https://neon.tech) (free tier Postgres). Run `backend/migrations/*.sql` against it in order, then optionally `backend/scripts/seed-demo-data.sql` for a small, idempotent demo dataset (6 patients, appointments/consultations covering every status, 2 invoices in different states) so a tester doesn't have to enter data manually.
- `backend/src/db/pool.ts` auto-enables SSL whenever `DATABASE_URL` isn't pointing at `localhost`/the local `db` container, so the same code works against local Docker Postgres and hosted providers like Neon without changes.
- On Render, `FRONTEND_ORIGIN` (api service) and `VITE_API_BASE_URL` (frontend service, baked in at build time — changing it requires a redeploy, not just a restart) must match the actual assigned `*.onrender.com` URLs, which get a random suffix if the plain name is already taken by another Render account.

To redeploy after pushing new commits to `feature/consultation`, Render auto-syncs from the Blueprint; use "Manual Deploy" on the frontend service if only an env var changed (static builds don't pick up new env vars on their own).

## Notes

- Initial PostgreSQL schema is in `backend/migrations/001_init.sql`.
- Development seed user is in `backend/migrations/002_seed_dev_user.sql`.
- Auth tokens are JWTs stored in browser local storage.
- Protected routes are enforced on the frontend (`src/components/auth/ProtectedRoute.tsx`).

