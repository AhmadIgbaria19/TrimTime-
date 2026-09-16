variable "aws_region" {
  type        = string
  description = "Commercial AWS Region. Changing this after apply is a migration."
  default     = "eu-central-1"
}

variable "name_prefix" {
  type        = string
  description = "Prefix for resource names."
  default     = "trimtime"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidr" {
  type    = string
  default = "10.0.0.0/24"
}

variable "private_subnet_a_cidr" {
  type    = string
  default = "10.0.10.0/24"
}

variable "private_subnet_b_cidr" {
  type    = string
  default = "10.0.11.0/24"
}

variable "ssh_ingress_cidr" {
  type        = string
  description = "If non-empty, allow SSH from this CIDR (your /32). Empty = SSM only, no port 22."
  default     = ""
}

variable "ec2_instance_type" {
  type    = string
  default = "t4g.small"
}

variable "ec2_volume_gb" {
  type    = number
  default = 20
}

variable "ec2_key_name" {
  type        = string
  description = "Optional existing EC2 key pair name. Empty = no SSH key (SSM)."
  default     = ""
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_engine_version" {
  type        = string
  description = "PostgreSQL major (or major.minor) version."
  default     = "16"
}

variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "trimtime"
}

variable "db_master_username" {
  type        = string
  description = "RDS master user. The Node app must not use this; it uses trimtime_app from SSM."
  default     = "trimtime_admin"
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_deletion_protection" {
  type    = bool
  default = true
}

variable "allow_rds_master_secret_read" {
  type        = bool
  description = "If true, the instance role may read the RDS master secret (bootstrap only). Keep false afterwards."
  default     = false
}

variable "ssm_app_path_prefix" {
  type        = string
  description = "SSM path prefix for app SecureString parameters. Terraform does not put values here."
  default     = "/trimtime/prod/app"
}

variable "github_repository" {
  type        = string
  description = "GitHub org/repo for OIDC (exact name, including a trailing hyphen if the repo has one)."
  default     = "AhmadIgbaria19/TrimTime-"
}

variable "github_environment" {
  type        = string
  description = "GitHub Environment name used by the deploy job (required reviewer)."
  default     = "production"
}

variable "github_oidc_provider_arn" {
  type        = string
  description = "Existing token.actions.githubusercontent.com provider ARN. Empty creates one."
  default     = ""
}

variable "tags" {
  type = map(string)
  default = {
    Project = "trimtime"
    Phase   = "7a-local-prep"
  }
}
