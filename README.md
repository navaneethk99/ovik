# Ovik Monorepo

This repo is organized around three apps:

- `apps/backend`: Go attendance API that writes recognition events to PostgreSQL/Neon
- `apps/recognizer`: Go face recognizer that detects known faces and posts attendance events
- `apps/frontend`: Next.js operator dashboard

Shared contracts live in `pkg/attendance`.

## Repo layout

```text
.
├── apps
│   ├── backend
│   │   └── main.go
│   ├── frontend
│   │   ├── app
│   │   └── package.json
│   └── recognizer
│       ├── known_faces
│       ├── models
│       └── main.go
├── pkg
│   └── attendance
│       └── event.go
├── .env.example
├── package.json
├── go.mod
└── go.sum
```

## Environment

Copy `.env.example` to `.env` and fill in your values:

```env
DATABASE_URL=postgres://USER:PASSWORD@HOST/DBNAME?sslmode=require
BACKEND_ADDR=:8080
ATTENDANCE_POST_URL=http://localhost:8080/attendance
ATTENDANCE_AUTH_TOKEN=
ATTENDANCE_MARK_COOLDOWN_SECONDS=300
```

## Run the backend

```bash
go run ./apps/backend
```

The backend creates this table if it does not exist:

```sql
CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL,
  recognized_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Each recognition event inserts a new row.

## Run the recognizer

```bash
go run ./apps/recognizer
```

The recognizer loads face models from `apps/recognizer/models` and known faces from `apps/recognizer/known_faces`.

## Run the frontend

```bash
pnpm install
pnpm dev:frontend
```

The frontend runs on `http://localhost:3000` by default.

## Run all apps with Docker Compose

Create a root `.env` file first. Then run:

```bash
docker compose up --build
```

That starts:

- `backend` on `http://localhost:8080`
- `frontend` on `http://localhost:3000`
- `recognizer` as a Linux container posting to `backend`

The recognizer service expects webcam device access at `/dev/video0` and X11 display forwarding via `/tmp/.X11-unix`. That is suitable for a Linux host. On macOS, camera access from Docker is not reliable, so run the recognizer on the host if needed and keep backend/frontend in Compose.
