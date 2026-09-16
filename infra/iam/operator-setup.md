# Operator IAM (laptop) — Phase 7b

Do **not** put access keys in Git or chat. This file is the procedure only.

## Identity already seen on this laptop (2026-09-16, read-only)

| Field | Value |
| --- | --- |
| Account | `035611741535` |
| IAM user | `terraadmin` |
| ARN | `arn:aws:iam::035611741535:user/terraadmin` |
| CLI default region | `us-east-1` (TrimTime uses **`eu-central-1`**) |
| Attached policy | `AdministratorAccess` (broader than TrimTime needs) |
| Console password | none (`GetLoginProfile` not found) |
| MFA on this user | **none** |
| Root MFA | **on** (`AccountMFAEnabled` = 1) |
| Root access keys | **none** |

Always pass `--region eu-central-1` (or `AWS_DEFAULT_REGION=eu-central-1`) for TrimTime. Do not assume `us-east-1`.

## What you do in the console (root, once)

Root already has MFA. Keep it. Do not create root access keys.

1. IAM → Users → `terraadmin` → **Security credentials** → **Assign MFA device** (authenticator app). Even without a console password, MFA can protect API use if you later require it.
2. Billing → **Budgets** → create **one cost budget**, monthly, USD, **email only**, **no budget actions**:
   - Name: `trimtime-monthly`
   - Amount: **20** USD (alert band; not a cap)
   - Alerts at **25% ($5)**, **50% ($10)**, **100% ($20)** of **actual** costs
   - Optional second forecasted alert at 100%
3. Confirm the **$273** invoice is a **prior period** in Bills. Monthly budgets track **this month’s usage**, not unpaid old invoices — unless AWS posts an adjustment into the current period (check Bills if an alert fires with no new resources).

Budgets are **not** a spend stop. Email can arrive hours late.

## Least privilege (later; not required to unblock the first apply)

`terraadmin` can already create the stack. After the first successful apply, replace `AdministratorAccess` with a custom policy limited to:

- `eu-central-1` (plus IAM/Budgets which are global)
- VPC, EC2, EIP, RDS, ECR, SSM, Secrets Manager (RDS-managed master only), S3 on the **state bucket only**, CloudWatch Logs, IAM roles named `trimtime-*`

Do that as a **follow-up**, not in the same change as the first apply, so a typo in the policy cannot block rollback.

## Local CLI (no keys in chat)

Keys already live in `%USERPROFILE%\.aws\credentials` (gitignored by AWS, not in this repo). Rotate them in the console if they were ever pasted anywhere.

```powershell
$env:AWS_DEFAULT_REGION = "eu-central-1"
aws sts get-caller-identity
# Expect: user/terraadmin and account 035611741535
```

## GitHub Actions OIDC (Phase 8)

No access keys in GitHub. After `terraform apply` of the GitHub OIDC role:

1. Copy `terraform output github_actions_role_arn` and `ec2_instance_id`.
2. GitHub repo → **Settings → Secrets and variables → Actions → Variables**:
   - `AWS_ROLE_ARN` = that role ARN
   - `EC2_INSTANCE_ID` = the instance id
   - `SITE_URL` = `http://<elastic_ip>` (later https)
3. GitHub repo → **Settings → Environments → New environment** named **`production`**. Add yourself as a **required reviewer**. Do this **before** the first push to `main` that includes `publish`/`deploy`, or the deploy job will run without a human gate.
4. If `terraform apply` fails because `token.actions.githubusercontent.com` already exists in the account, set `github_oidc_provider_arn` to that ARN and apply again. Do not create a second provider for the same URL.

The workflow file is still [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Pull requests stay checks-only. `push` to `main` publishes arm64 then waits on the `production` environment before SSM deploy.

## First AWS resource (only after apply approval)

The S3 bucket in `infra/terraform/bootstrap` does **not** exist yet. Suggested name (globally unique): `trimtime-tfstate-035611741535`. Confirm with `aws s3api head-bucket` before apply; if it is taken, add a short suffix.

Order after approval: bootstrap `apply` → `backend.hcl` → app stack `init` / `plan` / `apply`.
