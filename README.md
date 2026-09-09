# TrimTime

Local salon booking for a single shop: public catalog, customer appointments, and an owner desk.

This repository is a CV / DevOps learning project. The product UI is English, left-to-right, black and gold. Kubernetes is out of scope.

## Current shape

| Piece | How it runs today |
| --- | --- |
| React + Vite client | Host process, `http://127.0.0.1:3001` |
| Express + TypeScript API | Host process, `http://127.0.0.1:4000` |
| PostgreSQL 16 | Docker only, `127.0.0.1:5434`, volume `trimtime_pgdata` |

Do not bind this stack to port **3000** (other local apps often use it).

```
TirmTimeProject/
  client/          Vite SPA (book, My Bookings, admin desk)
  server/          Express API, migrations, tests
  db/init.sql      First-boot Postgres hook (tables come from migrations)
  docker-compose.yml   Postgres only
  ROADMAP.md       Phased plan (product → Docker → CI → AWS)
```

The **app is not in Docker yet**. A machine that follows this README still needs Node on the host. That is a known limit until the Docker phase.

## Prerequisites

- Node.js 22
- Docker Desktop (for Postgres)
- npm

## Run locally

1. Copy environment values and edit secrets. Never commit `.env`.

```bash
cp .env.example .env
```

2. Start Postgres and wait until it is healthy. This does **not** delete the existing volume.

```bash
npm run db:up
```

3. Install dependencies and start the client + API.

```bash
npm install
npm run dev
```

On API startup the server applies SQL migrations, seeds the demo salon **North Atelier** if the catalog is empty, and seeds the admin user from `.env` if that phone is unused.

- Site: `http://127.0.0.1:3001`
- Health: `http://127.0.0.1:4000/api/health`

Optional: `npm run db:migrate` applies migrations without starting the HTTP server.

## Tests

Mutating tests **must not** use the live salon database. `npm run test:live` creates/resets `trimtime_test` on the same Docker instance and refuses to run if `PGDATABASE` is not that name.

```bash
npm test        # unit tests (no live salon writes)
npm run test:live
```

Last local result (2026-09-09): 20 unit tests passed; 13 isolated live tests passed. The live `trimtime` database was unchanged (4 users, 7 bookings).

## What already works

- Public catalog and availability in `Asia/Jerusalem`, including hours, breaks, and one-time closes
- Customer register / login (public register is always `customer`)
- Customer book → **Pending** hold; My Bookings; cancel with notice on **Confirmed**
- Admin dashboard, manage bookings, settings (salon, services, barbers, hours)
- Role split: customers cannot call admin APIs; the admin user cannot use customer booking routes
- Complete / No-show from appointment start only
- Pending with no reply becomes **Expired** at start (startup job + interval, not only the admin page)
- Manual admin booking for an existing customer **or** a visitor name/phone on the booking row (no user account, not shown on My Bookings)
- Salon cancel of **Confirmed** with actor + reason, including after start, without using Completed / No-show
- Overlap control: availability engine + `pg_advisory_xact_lock` per barber (not a Postgres exclusion constraint)
- Booking rows snapshot price, duration, and names so later catalog edits do not rewrite history

## Current limits

- Demo only: no payments, no SMS, no real shop
- App processes still run on the host; Compose starts Postgres only
- Catalog image paths may 404 until assets are added
- Phone numbers are stored as E.164 (`+972`); there is no verified-phone linking of guest bookings to accounts
- Isolated live tests wipe `trimtime_test` at the start of each `test:live` run
- Full click-through of every screen on a physical phone was not used as the proof; API journeys were

## Git

`.env`, dumps, keys, and `node_modules` are gitignored. Commit `.env.example` and `package-lock.json`.

Default branch: `main`. Later work should use short-lived branches and pull requests. Do not commit customer exports or production secrets.

## Next (not in this phase)

Dockerize the app, CI, then an AWS design/cost review before any paid resources or a domain.
