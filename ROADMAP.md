# TrimTime roadmap

Working document across sessions. Update **Status**, **Decisions**, and **Tests** after each completed step. Do not treat this file as a feature dump.

## Goal

Finish the booking product, run it in Docker, then publish it on AWS with a stable URL and HTTPS that works from a phone while this computer is off.

The project is for a CV and for practical DevOps: Git, Linux, Docker, CI/CD, Terraform, AWS, monitoring, and rollback. **No Kubernetes.**

Do not add tools or features only to lengthen the stack.

## How we work

- One step at a time. Short goal and change list before coding.
- After each step: what changed, how to run and test it, what was actually tested, what is still missing; then **stop for approval**.
- Keep English LTR UI, black/gold identity, current data and permissions.
- Do not stop other projects or delete Docker volumes. Keep current ports (`3001` client, `4000` API, Postgres `5434`).
- Secrets stay out of Git. No paid AWS resources or domain purchase before architecture and cost are approved.

### Status values

| Value | Meaning |
| --- | --- |
| `done` | Agreed, implemented, and tested in session |
| `in_review` | Documented or proposed; waiting for Ahmd |
| `blocked` | Cannot start until a listed decision |
| `todo` | Not started |

## Product already in place (before this roadmap)

Local app (host) + Postgres in Docker. Health `step: 7`.

- Public catalog, availability, customer register/login (`customer` only from public register).
- Customer book → **Pending** hold; My Bookings; cancel with notice on **Confirmed**.
- Admin: Dashboard, Manage Bookings, Settings (salon, services, barbers, hours, one-time closes).
- Role split: admin cannot use customer booking routes; customers cannot use admin API.
- Complete / No-show only from appointment start, UI and API.
- Manual admin booking: existing customer **or** visitor name/phone on the booking row (no user).
- Pending unanswered at start becomes **Expired**; salon can cancel Confirmed with a reason.
- Ports: client `3001`, API `4000`, Postgres `127.0.0.1:5434`. Do not use `3000`.

---

## Phase 1 — Close functional gaps

**Status:** `done`

**Success:** Agreed behaviour works and is visible for customer and admin.

### 1.1 Pending policy

**Decision:** **A — expire at start.** New status **Expired**. `hold_expires_at = start_at` on Pending. Confirm and Reject are blocked at or after start. The row is persisted as Expired.

Expiry runs without opening Manage Bookings: API startup, a 15s interval, availability checks, customer My Bookings, and the admin list. After a server restart, overdue Pending rows are expired on boot.

Confirm vs expire is serialized with `FOR UPDATE`. If start has been reached, confirm cannot win; the row becomes Expired and the API returns 409.

**Tests:** unit (`evaluateAdminAction`, `expirePendingRowIfDue`, customer cancel of Expired blocked) plus live DB: expire without admin GET; confirm after start → 409 and Expired; concurrent confirm + `expireDuePending` → Expired, never Confirmed.

### 1.2 Manual booking for a visitor without an account

**Decision:** Guest name + phone + optional note on the **booking row**. `customer_id` is nullable. No `users` insert. No attach by matching phone. Desk list uses `LEFT JOIN users` and shows a visitor tag. `GET /api/bookings` stays `WHERE customer_id = $1`, so guests never appear on any account’s My Bookings.

Existing-customer manual booking remains available in the same drawer.

**Tests:** live create with a customer’s phone: user count unchanged, `customer_id` null, admin list shows it, that customer’s My Bookings does not.

### 1.3 Salon-side cancel

**Decision:** Admin **Cancel** on **Confirmed** only → status **Cancelled**. No customer notice window. Allowed after start if the visit is still Confirmed (not Completed / No-show / already closed). Reason required (2–280). Stored: `cancelled_by_role = admin`, `cancelled_by_user_id`, `cancelled_reason`, `cancelled_at`. Customer My Bookings shows “Cancelled by the salon: …”. Reject stays for Pending. Customer cancel still uses the notice rule on Confirmed.

**Tests:** unit allows cancel after start; live insert past Confirmed, admin cancel with reason, customer payload includes actor + reason.

---

## Phase 2 — Local full-stack test

**Status:** `done`

**Success:** Agreed behaviour works on an isolated database; live salon data was not used.

Mutating tests run only against **`trimtime_test`** (created on the same Docker Postgres, schema reset each run). The app `.env` stays on `trimtime`. Guard: live test files refuse to start if `PGDATABASE` is not the test database.

**Proven**

| Check | Result |
| --- | --- |
| Customer book → admin confirm → customer cancel; note kept | pass |
| Admin reject Pending | pass |
| Change service price/duration/name does not rewrite old booking snapshot | pass |
| Two concurrent POSTs for the same slot: one 201, one 409; one row | pass |
| Same Idempotency-Key retry returns the same booking; one row | pass |
| Customer A cannot see B’s bookings; customer 403 on `/api/admin/*`; admin 403 on `POST /api/bookings` | pass |
| Bookings still present after API process restart (Postgres) | pass |
| Phase 1 live suite on the same test DB (Expired, guest row, salon cancel) | pass |
| Login page loads in Chrome headless at 1280×800 and 390×844 when client `:3001` is up | pass |

**How to run**

- Units (no database writes): `npm test`
- Isolated live suite: `npm run test:live`

**Known limits**

- Did not click through every logged-in screen as a human on a physical phone (that would use the live API). API journeys are the proof.
- `trimtime_test` is wiped at the start of `test:live`; do not point the running app at it.

**Tests:** `npm test` 20 passed. `npm run test:live` 8 + 5 passed (0 failed). Live salon DB unchanged: 4 users, 7 bookings.

---

## Phase 3 — Git and docs

**Status:** `done`

**Success:** Secrets stay out of Git. A CV-facing README describes how to run and test the **current** stack. Local `main` commit exists; GitHub remote and first push wait for Ahmd’s repo URL.

**Done**

- Tightened `.gitignore` (`.env`, `.env.*` except `.env.example`, dumps, keys, build/coverage, editor junk).
- Reviewed `.env.example`: placeholder values only (`change_me`). Local `.env` (real `PGPASSWORD` / `ADMIN_PASSWORD` / `SESSION_SECRET`) is ignored and must not be added.
- No customer dump files in the tree. SQL under `server/src/db/migrations/` is schema, not data. Test fixtures use fake phones, not a live export.
- Project had **no `.git` directory**. Initialized `main` and created one local commit after this review. No `origin`, no push.
- README (English): layout, ports, `db:up` / `dev` / `test` / `test:live`, completed behaviour, current limits.

**GitHub (Ahmd, after this phase)**

1. On GitHub: New repository, empty (no README / .gitignore / license, this repo already has them).
2. Send the HTTPS or SSH URL.
3. Review `git status` and the file list together **before** the first `git push`.
4. Then: `git remote add origin <url>` and `git push -u origin main`.

**Tests:** docs-only. Did not re-run the live suite in this step.

---

---

## Phase 4 — App in Docker

**Status:** `done`

Production-oriented Dockerfile, `.dockerignore`, Compose for app + Postgres, persistent volume, runtime config, healthchecks, explicit migrations.

**Success:** clean machine follows README, **no Node on the host**, data survives container restart. Do not remove `trimtime_pgdata`. Do not touch other stacks on port `3000`.

**Done**

- Multi-stage `Dockerfile` builds the Vite client and runs the Express API with `tsx`.
- `.dockerignore` keeps `.env`, Git, docs, and `node_modules` out of the image.
- Compose starts `trimtime-app` + existing `trimtime-postgres` on volume `trimtime_pgdata`. Inside the app container `PGHOST=db` / `PGPORT=5432`. Secrets come from host `.env` at runtime.
- App listens on `0.0.0.0:3001` in Docker and serves the SPA + `/api` from one origin.
- Host `npm run up` → `docker compose up -d --build --wait`. `docker compose down` without `-v`.

**Tests:** Image built. `trimtime-app` + `trimtime-postgres` healthy. `/api/health` ok. SPA 200, catalog LAMSA. Admin login 200; anonymous admin 401; admin cannot POST `/api/bookings` (403). Guest book 201 Confirmed, salon cancel 200. After `docker compose restart`: 4 users, salon LAMSA, persistence row kept. Volume `trimtime_pgdata` not removed. `task-app` on port 3000 untouched. Host `npm test` 20 passed. Did not run `test:live` through the container. No physical-phone UI pass.

---

## Phase 5 — CI

**Status:** `done` (workflow added; green run waits for a GitHub pull request)

GitHub Actions: lint/typecheck, tests, app build, Docker image. Tests use an isolated database, never production.

**Success:** a PR with a deliberate error fails CI; after the fix it passes. Explain each pipeline stage.

**Done**

- Workflow: `.github/workflows/ci.yml` on pull requests and `main`.
- Job 1 — typecheck + unit tests + client `vite build` (no ESLint package in this repo).
- Job 2 — `npm run test:live` on a GitHub-hosted Postgres 16. Env uses CI-only passwords. `prepare-test-db` still refuses unless `PGDATABASE` is not `trimtime_test` at reset time, then the suite switches to `trimtime_test`.
- Job 3 — `docker build` of the app image, no push to a registry.
- No production `.env`, no laptop volume, no AWS.

**Tests:** workflow files added on branch `ci`. First GitHub run happens when that branch is pushed and a PR is opened. The deliberate fail-then-fix demo is the next check on GitHub, not a local mock.

---

## Phase 6 — AWS design and cost review

**Status:** `todo` — **no paid resources until approved**

Draft: EC2 (app), ECR (image), RDS PostgreSQL, Nginx in front. Document network, IAM, secrets, domain, HTTPS, monthly cost, availability limits. Database **not** public on the internet.

**Do not create paid resources or buy a domain before Ahmd approves architecture and cost.**

---

## Phase 7 — Provision and first deploy

**Status:** `todo` (blocked on phase 6 approval)

Terraform with a locked remote state. Repeatable Linux + Docker + Nginx (Ansible only if we adopt it). Image from ECR, app to RDS, safe migrations, stable URL + HTTPS.

**Success:** open the site from a phone on an external network, book, review in admin, this PC off.

---

## Phase 8 — CD

**Status:** `todo`

CI success → versioned image → ECR → AWS. GitHub → AWS via **OIDC** and least privilege. Post-deploy health check, failure behaviour, rollback, and DB migration compatibility.

**Success:** a small change ships through the pipeline and appears on the live site.

---

## Phase 9 — Monitor and recover

**Status:** `todo`

Logs, monitoring, a practical alert. Start with CloudWatch. Prometheus/Grafana only if we agree a clear teaching goal.

Test rollback to a previous image and restore a DB backup **into a separate environment**. Document how to diagnose an outage.

---

## Phase 10 — CV presentation

**Status:** `todo`

Final README: architecture, runbook, CI/CD, Terraform, monitoring, recovery, known limits.

A live walkthrough Ahmd can explain: book a visit, ship a change through the pipeline, read logs, talk through a failed deploy. Decisions must be understandable, not only generated code.

---

## Decisions log

| Date | Topic | Choice |
| --- | --- | --- |
| 2026-09-09 | Roadmap | This file adopted. Phase 1 audit only; no functional code until Pending (and related) choices. |
| 2026-09-09 | Pending | Option A: status **Expired** at appointment start; confirm blocked after start; expiry on boot + interval, not only admin UI. |
| 2026-09-09 | Guest booking | Name/phone/note on the booking row; no user; no phone auto-link; hidden from My Bookings. |
| 2026-09-09 | Docs language | README in English for the CV; session explanations in Arabic. |
| 2026-09-09 | GitHub | Local `main` first. Remote and first push only after Ahmd creates the repo and we review the file list. |

## Session notes

- 2026-09-09: Phase 3 done. README (EN), gitignore, `.env` kept out. Local git `main` commit. Waiting for Ahmd’s GitHub URL before remote/push.
- 2026-09-09: Phase 4 Docker app on branch `docker-app`. Volume `trimtime_pgdata` kept. No CI/AWS.
- 2026-09-10: Phase 5 workflow added on branch `ci`. No AWS. Green GitHub run waits for a PR.
