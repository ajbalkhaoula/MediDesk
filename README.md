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

## Notes

- Initial PostgreSQL schema is in `backend/migrations/001_init.sql`.
- Development seed user is in `backend/migrations/002_seed_dev_user.sql`.
- Auth tokens are JWTs stored in browser local storage.
- Protected routes are enforced on the frontend (`src/components/auth/ProtectedRoute.tsx`).

