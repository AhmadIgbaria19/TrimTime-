output "aws_region" {
  value = var.aws_region
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_id" {
  value = aws_subnet.public_a.id
}

output "private_subnet_ids" {
  value = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

output "availability_zone_app" {
  description = "AZ shared by EC2 and the Single-AZ RDS instance."
  value       = aws_subnet.private_a.availability_zone
}

output "ec2_instance_id" {
  value = aws_instance.app.id
}

output "elastic_ip" {
  description = "Copy into Ansible inventory as ansible_host after apply."
  value       = aws_eip.app.public_ip
}

output "ecr_repository_url" {
  description = "Prefix for linux/arm64 images tagged with the git SHA."
  value       = aws_ecr_repository.app.repository_url
}

output "rds_address" {
  description = "RDS DNS name for PGHOST. Do not use a raw IP with verify-full."
  value       = aws_db_instance.app.address
}

output "rds_port" {
  value = aws_db_instance.app.port
}

output "rds_db_name" {
  value = aws_db_instance.app.db_name
}

output "rds_master_username" {
  value = aws_db_instance.app.username
}

output "rds_master_user_secret_arn" {
  description = "Secrets Manager ARN for the RDS master password. Not for the Node app."
  value       = try(aws_db_instance.app.master_user_secret[0].secret_arn, null)
}

output "github_actions_role_arn" {
  description = "GitHub Actions OIDC role. Paste into repository variable AWS_ROLE_ARN."
  value       = aws_iam_role.github_actions.arn
}

output "github_oidc_provider_arn" {
  value = local.github_oidc_provider_arn
}

output "ssm_parameter_paths" {
  description = "Create these SecureString (and String) parameters by hand. Terraform does not store their values."
  value = {
    pghost         = "${var.ssm_app_path_prefix}/pghost"
    pgport         = "${var.ssm_app_path_prefix}/pgport"
    pguser         = "${var.ssm_app_path_prefix}/pguser"
    pgpassword     = "${var.ssm_app_path_prefix}/pgpassword"
    pgdatabase     = "${var.ssm_app_path_prefix}/pgdatabase"
    session_secret = "${var.ssm_app_path_prefix}/session_secret"
    admin_name     = "${var.ssm_app_path_prefix}/admin_name"
    admin_phone    = "${var.ssm_app_path_prefix}/admin_phone"
    admin_password = "${var.ssm_app_path_prefix}/admin_password"
    pgsslrootcert  = "${var.ssm_app_path_prefix}/pgsslrootcert"
  }
}
