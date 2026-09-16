# Partial S3 backend. Real bucket/key/region/lock come from gitignored backend.hcl:
#   terraform init -backend-config=backend.hcl
#
# Values are not hardcoded here so the bucket name stays off Git.

terraform {
  backend "s3" {}
}
