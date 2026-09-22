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
- Secrets stay out of Git. No paid AWS resources until Ahmd approves **apply** (Phase 7b). Domain purchase stays later.

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

**Status:** `done` (workflow on `main`; fail-then-fix proven on GitHub)

GitHub Actions: lint/typecheck, tests, app build, Docker image. Tests use an isolated database, never production.

**Success:** a PR with a deliberate error fails CI; after the fix it passes. Explain each pipeline stage.

**Done**

- Workflow: `.github/workflows/cicd.yml` on pull requests and `main`.
- Job 1 — typecheck + unit tests + client `vite build` (no ESLint package in this repo).
- Job 2 — `npm run test:live` on a GitHub-hosted Postgres 16. Env uses CI-only passwords. `prepare-test-db` still refuses unless `PGDATABASE` is not `trimtime_test` at reset time, then the suite switches to `trimtime_test`.
- Job 3 — `docker build` of the app image, no push to a registry.
- No production `.env`, no laptop volume, no AWS.

**Tests (GitHub, 2026-09-10):** PR [#2](https://github.com/AhmadIgbaria19/TrimTime-/pull/2) (`ci`) merged to `main`; Actions on `main` succeeded. PR [#3](https://github.com/AhmadIgbaria19/TrimTime-/pull/3) (`ci-fail-demo`): commit `2d762fa` **failed**; fix `f85c5a8` **succeeded** ([run](https://github.com/AhmadIgbaria19/TrimTime-/actions/runs/34489569300)). Local `npm test` (20 passed) is not a substitute for that run. **PR #3 is still open — not merged.**

---

## Phase 6 — AWS design and cost review

**Status:** `done` (architecture **accepted for local file prep**; cost still estimated; **no AWS resources**)

Design: [`docs/aws-design.md`](docs/aws-design.md). Operator notes: [`docs/aws-next.md`](docs/aws-next.md). Layout: [`infra/README.md`](infra/README.md).

**Accepted (local prep only):** commercial `eu-central-1`; one public `t4g.small`; RDS PostgreSQL 16 `db.t4g.micro` Single-AZ with a two-AZ private DB subnet group; ECR; Terraform ≥ 1.11 + S3 `use_lockfile`; Ansible; no ALB; no NAT Gateway; RDS-managed master password in Secrets Manager; app secrets in SSM.

Cost remains **~$42/month USD estimated** (several Frankfurt instance-hour lines unverified on official HTML). Free Tier not assumed. AWS account **reactivated 2026-09-16**; a prior **$273** invoice is under waiver review (not paid from this project). **No TrimTime resources created yet.**

**Not done in Phase 6:** `terraform apply`, Ansible on a host, domain, CD, application TLS, arm64 CI.

---

## Phase 7a — Local Terraform and Ansible files

**Status:** `done` (files on branch `aws-prep`; local validate passed; **not** applied)

## Phase 7b — Provision and first deploy on AWS

**Status:** `todo` (account open; **apply blocked** until Ahmd approves the plan and cost)

Read-only audit 2026-09-16: no EC2/EIP/NAT/ALB/RDS in the three Regions checked. Leftover non-TrimTime storage: ECR `vprofile-appimage`, four old S3 buckets. IAM `terraadmin` has AdministratorAccess, **no MFA**. Root MFA is on; no root keys. **No AWS Budgets** returned. CLI default region is `us-east-1`; TrimTime is `eu-central-1`.

First resource after approval: S3 state bucket (`infra/terraform/bootstrap`). Then app stack `plan`/`apply`. Prep notes: [`docs/aws-7b-prep.md`](docs/aws-7b-prep.md), operator steps: [`infra/iam/operator-setup.md`](infra/iam/operator-setup.md).

After reopen: **audit billing and leftover resources first.** Then: bootstrap the S3 state bucket; `terraform apply`; Ansible on the EC2; app secrets in SSM; bootstrap DB role; arm64 image from a green CI SHA; health; phone test with this PC off.

Terraform ≥ 1.11, S3 state + `use_lockfile`. Migrations are forward-only; image rollback is allowed only when the migration gate says the previous SHA can run on the live schema.

**Success:** open the site from a phone on an external network, book, review in admin, this PC off. Local Docker / `terraform validate` is not that proof.

---

## Phase 8 — CD

**Status:** `in_review` (jobs in `cicd.yml`; OIDC provider + role **applied** 2026-09-17; GitHub Environment and variables still needed)

Keep **one** workflow file: [`.github/workflows/cicd.yml`](.github/workflows/cicd.yml). There is **no** second workflow for CD.

**Jobs (order)**

| Job | When | Role |
| --- | --- | --- |
| `quality` | PR and `push` to `main` | Typecheck, unit tests, client build |
| `live` | PR and `push` to `main` | Isolated Postgres `test:live` |
| `image` | PR and `push` to `main` | `docker build` smoke on the runner (amd64 on `ubuntu-latest`) |
| `publish` | **`push` to `main` only**, after `quality` + `live` + `image` | `docker buildx --platform linux/arm64` from **that git SHA**; push to ECR tagged with the **full SHA** |
| `deploy` | **`push` to `main` only**, after `publish` | Pull/run **that same SHA** on the TrimTime EC2 (SSM Run Command). **Manual approval** (GitHub Environment `production` required reviewer) **before** production deploy |

Pull requests run the three checks only. They must not publish to ECR or deploy.

GitHub → AWS via **OIDC** (`infra/terraform/github_oidc.tf`). No long-lived AWS keys in the repo. The amd64 `image` job is a Dockerfile check, not the artifact that runs on `t4g.small`.

**Still needed before the first pipeline deploy:**

1. ~~`terraform apply` of the GitHub OIDC role~~ **done 2026-09-17** (`trimtime-github-actions`).
2. Repository variables `AWS_ROLE_ARN`, `EC2_INSTANCE_ID`, `SITE_URL`.
3. GitHub Environment `production` with a required reviewer.
4. Merge/push to **`main`** (this branch does not trigger `publish`/`deploy`).

**Success:** a small change on `main` is checked, published as arm64, approved, then appears on the live site.

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
| 2026-09-10 | AWS region | **Accepted (local prep):** commercial `eu-central-1`. Changing Region after apply is a migration. |
| 2026-09-10 | AWS shape | **Accepted (local prep):** one public `t4g.small` + private RDS `db.t4g.micro` Single-AZ; DB subnet group = two private AZs; skip ALB and NAT. |
| 2026-09-10 | Secrets | **Accepted:** app secrets in SSM SecureString; RDS master via RDS-managed Secrets Manager (one secret). |
| 2026-09-10 | Terraform state | **Accepted:** S3 `use_lockfile`, Terraform ≥ 1.11; no DynamoDB lock table. |
| 2026-09-16 | AWS account | Reactivated. $273 prior invoice under waiver review — do not pay from this project. Apply still needs a separate go-ahead. |
| 2026-09-16 | Budgets | Propose email alerts at **$5 / $10 / $20 actual** (not a cap). None configured yet. |
| 2026-09-16 | CI/CD workflow | **Accepted.** One file `.github/workflows/cicd.yml`. Keep `quality` / `live` / `image`. Add `publish` (arm64 → ECR) then `deploy` (same SHA → EC2). PRs = checks only. `push` to `main` = publish + deploy. Manual GitHub Environment approval before production deploy. OIDC. **This decision is not terraform apply approval.** |
| 2026-09-17 | Phase 8 files | **Implemented in repo.** `publish`/`deploy` in `cicd.yml`; `github_oidc.tf`; SSM helper `.github/scripts/ssm-deploy.sh`. OIDC role **not applied**. GitHub Environment `production` and Action variables not set yet. |

## Session notes

- 2026-09-09: Phase 3 done. README (EN), gitignore, `.env` kept out. Local git `main` commit. Waiting for Ahmd’s GitHub URL before remote/push.
- 2026-09-09: Phase 4 Docker app on branch `docker-app`. Volume `trimtime_pgdata` kept. No CI/AWS.
- 2026-09-10: Phase 5 workflow added on branch `ci`. No AWS. Green GitHub run waits for a PR.
- 2026-09-10: GitHub Actions on PR #3: fail (`2d762fa`) then success (`f85c5a8`). PR #3 not merged. AWS account still suspended.
- 2026-09-10: Phase 6 design in `docs/aws-design.md` (`in_review`). No Terraform apply, no Ansible, no CD, no AWS keys.
- 2026-09-10: Phase 6 design corrected (RDS two-AZ subnet group, TLS verify-full, S3 native lock, SSM Agent, arm64/rollback, cost sources, phases). Still `in_review`. No apply, no app/CI code changes, no commit.
- 2026-09-16: Account reactivated. Read-only audit (no delete, no apply). Leftover ECR/S3 from old labs. `terraadmin` in eu-central-1 for TrimTime; CLI default was us-east-1. Phase 7b still waiting for apply approval.
- 2026-09-17: Phase 8 jobs written in `cicd.yml`. Terraform OIDC role ready, not applied. Not an apply go-ahead.
