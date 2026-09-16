# Phase 7b prep notes (2026-09-16)

Read-only AWS checks and local Terraform validation. **No apply.**

## Account

- Reactivated. Prior invoice **$273** is under waiver review — not paid or changed from this repo.
- Identity used: IAM `terraadmin` in account `035611741535`. Not root. CLI default region was `us-east-1`; TrimTime is `eu-central-1`.

## Leftovers (not deleted automatically)

No EC2, EIP, NAT, ALB, or RDS in `eu-central-1`, `us-east-1`, or `il-central-1`. No unattached EBS, no RDS snapshots, no Secrets Manager secrets in those two Regions.

Still present (storage / old labs, not TrimTime):

- ECR `vprofile-appimage` in `eu-central-1` (many ~310 MB images)
- S3: `botopy010626`, `devturt26`, `elasticbeanstalk-eu-central-1-035611741535`, `vprofile-las-mipr`
- Extra IAM users: `actions-ecr`, `itadmin`, `jenkins`, `python-admin`, `vprofile-s3-admin`

## Gaps before apply

| Item | Status |
| --- | --- |
| Terraform / Ansible files | Present on `aws-prep` |
| App TLS `verify-full` | Not in code yet (`docs/aws-next.md`) |
| ARM64 CI/CD | Not in CI yet |
| MFA on `terraadmin` | Missing |
| AWS Budgets | None returned by `describe-budgets` |
| S3 state bucket | **Not created** — first paid resource after approval |
| Domain / HTTPS | Later |

## Terraform plans (2026-09-16, no apply)

- Bootstrap (`infra/terraform/bootstrap`): **5 to add** — S3 bucket `trimtime-tfstate-035611741535`, versioning, AES256, public-access block, deny-HTTP policy. **This is the first create after approval.**
- App stack (`infra/terraform`, local backend because the state bucket does not exist yet): **25 to add**, 0 destroy. AMI `ami-0e79e661e73ddfac9` (Ubuntu 24.04 ARM) in `eu-central-1`. RDS Single-AZ `eu-central-1a`, `db.t4g.micro`, `manage_master_user_password = true`.
- A saved `trimtime.tfplan` is local and gitignored. **Do not apply it** until Ahmd approves **and** the state bucket exists; then `init -backend-config` and a **new** plan.

## Monthly cost if TrimTime runs all month (eu-central-1, no Free Tier, no tax)

Same bands as [`aws-design.md`](aws-design.md) §9: **about $36–$45**, planning **~$42**. Leftover `vprofile-appimage` ECR is extra (~$1+/mo) until Ahmd deletes it.

## Planned TrimTime resources (after a later apply)

Bootstrap: one private versioned S3 bucket for state.

App stack: VPC + IGW, 1 public + 2 private subnets, SGs, IAM instance profile, ECR `trimtime-app`, `t4g.small` + 20 GB gp3 + 1 EIP, RDS PostgreSQL 16 `db.t4g.micro` Single-AZ 20 GB + one Secrets Manager master secret. No ALB, no NAT.
