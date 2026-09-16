# TrimTime infrastructure (local prep)

Files for the accepted Phase 6 design. **Do not `terraform apply` and do not run Ansible against a host until the AWS account is open and Ahmd approves execution (Phase 7b).**

Local Docker Compose in the repo root is unchanged and remains how the salon runs on this PC.

## Layout

| Path | Role |
| --- | --- |
| `terraform/bootstrap/` | Creates the S3 bucket for remote state (later). Uses **local** state on purpose for the first create. |
| `terraform/` | VPC, subnets, SGs, IAM, ECR, EC2, RDS. Remote backend is **not** configured until the bucket exists. |
| `ansible/` | Docker, Nginx, SSM Agent, CA bundle path, Compose, deploy/rollback scripts. |

## What Terraform will output vs what you fill in later

**From `terraform output` after a future apply** (copy into Ansible inventory / group vars — never commit secrets):

- `elastic_ip` → Ansible `ansible_host`
- `ec2_instance_id` → SSM Run Command target
- `ecr_repository_url` → image prefix
- `rds_address` / `rds_port` → `PGHOST` / `PGPORT` in SSM-rendered env
- `rds_master_user_secret_arn` → bootstrap the app DB role only (not used by Node)
- `ssm_parameter_paths` → names to create by hand
- `github_actions_role_arn` → GitHub Actions variable `AWS_ROLE_ARN`

**Not produced by Terraform (create later, never Git):**

- SSM values: `/trimtime/prod/app/pgpassword`, `session_secret`, `admin_password`, plus non-secret `pguser` / `pgdatabase` / `pghost` if you store them there
- RDS master password (in Secrets Manager, managed by RDS)
- Domain, TLS certificates
- GitHub Environment `production` required reviewer and Action variables (`AWS_ROLE_ARN`, `EC2_INSTANCE_ID`, `SITE_URL`) after the OIDC role is applied
- `backend.hcl` and `terraform.tfvars` (gitignored; copy from `*.example`)

Example files use RFC 5737 documentation addresses and empty strings. They are **not** a real account.

## Backend order (Phase 7b)

The app stack **must not** assume an S3 bucket exists today.

1. Account audit (billing, leftover NAT/EIP/RDS).
2. Copy `bootstrap/terraform.tfvars.example` → `terraform.tfvars`. Set a **globally unique** bucket name (include your real account id when you have it; do not invent one in Git).
3. In `bootstrap/`: `terraform init` then `apply` (local state). That is the only apply that uses local state.
4. Copy `terraform/backend.hcl.example` → `backend.hcl` with that bucket name.
5. In `terraform/`: `terraform init -backend-config=backend.hcl` (`use_lockfile = true`). Then `plan` / `apply`.
6. Optionally copy bootstrap state into the same bucket under `bootstrap/terraform.tfstate` so the bucket definition is not only on the laptop.

Until step 5, use `terraform init -backend=false` for local validate only.

## Local checks (no AWS)

From `terraform/bootstrap` and `terraform/`:

```bash
terraform fmt -check
terraform init -backend=false
terraform validate
```

From `ansible/`:

```bash
ansible-playbook --syntax-check playbook.yml -i inventory/hosts.example.ini
```

Passing these checks is **not** proof the VPC, RDS, or ARM image works on AWS.

## First deploy outline (after 7b apply)

1. Put app secrets in SSM (paths from output).
2. Fill `ansible/inventory/hosts.ini` and `group_vars/all.local.yml` from outputs (gitignored).
3. Run the playbook against the EC2 (SSM or SSH).
4. Bootstrap `trimtime_app` in PostgreSQL using the master secret.
5. Build/push `linux/arm64` tagged with a **green CI SHA**.
6. On the laptop: `git diff "$LIVE" "$NEW" -- server/src/db/migrations` (see `docs/aws-design.md` §7).
7. `sudo /usr/local/sbin/trimtime-deploy "$NEW"`.
8. Health, then phone test. Rollback only if the migration gate allows it.
