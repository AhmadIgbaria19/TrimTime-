# Next AWS work

Local Docker Compose continues to use Postgres without TLS unless `PGSSLROOTCERT` is set. Phase 8 jobs are in `cicd.yml`; the OIDC role is not applied yet.

## 1. PostgreSQL TLS (`verify-full`)

Today `server/src/db/pool.ts` builds a `pg.Pool` with host, port, user, password, and database only.

Before the app can talk to RDS:

1. Set `PGHOST` to the RDS **DNS endpoint** (Terraform output `rds_address`). Do not use a raw IP if hostname checks are on.
2. Put `eu-central-1-bundle.pem` on the instance (Ansible already templates this path). Pass it into the container.
3. Enable TLS in the pool, for example `ssl: { rejectUnauthorized: true, ca: <bundle> }`. Equivalent `libpq` mode: `sslmode=verify-full`.
4. **Do not** ship `rejectUnauthorized: false` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.

RDS for PostgreSQL 16 has `rds.force_ssl` on by default. A client without TLS will be refused.

Local Compose and GitHub `test:live` can keep connecting without TLS until that change is designed to be environment-specific (`PGSSLMODE` / only when `PGSSLROOTCERT` is set).

## 2. linux/arm64 publish + deploy (Phase 8)

Implemented in [`.github/workflows/cicd.yml`](../.github/workflows/cicd.yml) (same file as `quality` / `live` / `image`).

| Job | Trigger | After |
| --- | --- | --- |
| `quality`, `live`, `image` | PR and `push` to `main` | (already exist) |
| `publish` | `push` to `main` only | all three checks green |
| `deploy` | `push` to `main` only | `publish` + **manual GitHub Environment `production` approval** |

`publish` from the **same commit**:

```bash
docker buildx build --platform linux/arm64 -t "$ECR_URL:$GIT_SHA" --push .
```

ECR tag = full git SHA. `deploy` uses **that** tag on EC2 (SSM script `.github/scripts/ssm-deploy.sh`). Proof of ARM is health on the Graviton instance, not QEMU on GitHub. Auth: GitHub **OIDC**, no long-lived AWS keys in the repo.

**Not live until:** `terraform apply` of `github_oidc.tf`, GitHub variables, Environment `production` with a required reviewer, and a push to `main`. That apply is a **separate** approval.

## 3. Deploy / health / rollback

See [`aws-design.md`](aws-design.md) §7 and [`../infra/README.md`](../infra/README.md).

Required **before** `trimtime-deploy`:

```bash
git diff "$LIVE_SHA" "$NEW_SHA" -- server/src/db/migrations
```

Keeping the previous image on the disk does **not** undo SQL. `migrate()` runs on every process start and there are no down migrations. Only deploy a breaking migration when you are ready to fix forward (or restore RDS onto a **new** instance).

## 4. First secrets on the instance (after apply)

Terraform does **not** write secret **values**. After 7b apply, on a trusted machine with AWS access (not Git):

1. Create SSM SecureString parameters listed in output `ssm_parameter_paths`.
2. Bootstrap role `trimtime_app` using the RDS master secret ARN (`rds_master_user_secret_arn`).
3. Ansible `trimtime-fetch-env` renders `/etc/trimtime/app.env` from SSM (root-only).
