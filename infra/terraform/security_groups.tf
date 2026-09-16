resource "aws_security_group" "app" {
  name        = "${var.name_prefix}-app"
  description = "EC2: HTTP/HTTPS from internet; SSH optional; egress HTTPS and to RDS"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP (Certbot HTTP-01 and redirect)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  dynamic "ingress" {
    for_each = var.ssh_ingress_cidr == "" ? [] : [var.ssh_ingress_cidr]
    content {
      description = "SSH from operator IP"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    description = "HTTPS (ECR, apt, ACME, SSM public endpoints)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "HTTP (apt mirrors, ACME)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.name_prefix}-app"
  }
}

resource "aws_security_group" "db" {
  name        = "${var.name_prefix}-db"
  description = "RDS: 5432 from app SG only"
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${var.name_prefix}-db"
  }
}

resource "aws_security_group_rule" "app_to_db" {
  type                     = "egress"
  description              = "Postgres to RDS"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app.id
  source_security_group_id = aws_security_group.db.id
}

resource "aws_security_group_rule" "db_from_app" {
  type                     = "ingress"
  description              = "Postgres from app"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.db.id
  source_security_group_id = aws_security_group.app.id
}
