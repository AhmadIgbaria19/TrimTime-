# Equivalent of infra/ansible/playbook.yml provision tasks.
# Run on the EC2 via SSM AWS-RunShellScript (dash). Does not start the app,
# does not call trimtime-fetch-env / trimtime-deploy.

set -eu
export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg nginx python3 unzip docker.io docker-compose-v2

if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  /tmp/aws/install
  rm -rf /tmp/aws /tmp/awscliv2.zip
fi

systemctl enable --now docker
systemctl enable --now nginx
usermod -aG docker ubuntu || true

install -d -m 0755 -o root -g root /opt/trimtime /etc/trimtime /var/lib/trimtime

curl -fsSL -o /etc/ssl/certs/rds-eu-central-1-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/eu-central-1/eu-central-1-bundle.pem
chmod 0644 /etc/ssl/certs/rds-eu-central-1-bundle.pem

cat > /etc/nginx/sites-available/trimtime << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
chmod 0644 /etc/nginx/sites-available/trimtime
ln -sfn /etc/nginx/sites-available/trimtime /etc/nginx/sites-enabled/trimtime
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

cat > /opt/trimtime/compose.yml << 'EOF'
# Production app only. Postgres is RDS, not this file.
# Image tag is the git SHA. Fill TRIMTIME_SHA via /etc/trimtime/image-sha.

services:
  app:
    image: 035611741535.dkr.ecr.eu-central-1.amazonaws.com/trimtime-app:${TRIMTIME_SHA}
    container_name: trimtime-app
    env_file:
      - /etc/trimtime/app.env
    environment:
      API_PORT: "3001"
      CLIENT_PORT: "3001"
      LISTEN_HOST: "0.0.0.0"
      CLIENT_DIST: /app/client/dist
      PGSSLROOTCERT: /etc/ssl/certs/rds-eu-central-1-bundle.pem
    ports:
      - "127.0.0.1:3001:3001"
    volumes:
      - /etc/ssl/certs/rds-eu-central-1-bundle.pem:/etc/ssl/certs/rds-eu-central-1-bundle.pem:ro
    restart: unless-stopped
EOF
chmod 0644 /opt/trimtime/compose.yml

cat > /usr/local/sbin/trimtime-fetch-env << 'EOF'
#!/bin/bash
# Render /etc/trimtime/app.env from SSM Parameter Store.
# Run on the EC2 as root after parameters exist. Values never belong in Git.
set -euo pipefail

REGION="eu-central-1"
PREFIX="/trimtime/prod/app"
DEST="/etc/trimtime/app.env"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

umask 077

get_param() {
  local name="$1"
  aws ssm get-parameter --region "$REGION" --name "${PREFIX}/${name}" --with-decryption \
    --query 'Parameter.Value' --output text
}

{
  echo "PGHOST=$(get_param pghost)"
  echo "PGPORT=$(get_param pgport)"
  echo "PGUSER=$(get_param pguser)"
  echo "PGPASSWORD=$(get_param pgpassword)"
  echo "PGDATABASE=$(get_param pgdatabase)"
  echo "SESSION_SECRET=$(get_param session_secret)"
  echo "ADMIN_NAME=$(get_param admin_name)"
  echo "ADMIN_PHONE=$(get_param admin_phone)"
  echo "ADMIN_PASSWORD=$(get_param admin_password)"
  echo "PGSSLROOTCERT=/etc/ssl/certs/rds-eu-central-1-bundle.pem"
} > "$TMP"

install -m 0600 -o root -g root "$TMP" "$DEST"
echo "Wrote $DEST"
EOF
chmod 0750 /usr/local/sbin/trimtime-fetch-env

cat > /usr/local/sbin/trimtime-deploy << 'EOF'
#!/bin/bash
# Deploy a git-SHA image already in ECR (linux/arm64).
# On the laptop FIRST: git diff "$LIVE" "$NEW" -- server/src/db/migrations
# Image rollback does not undo SQL. See docs/aws-design.md §7.
set -euo pipefail

NEW_SHA="${1:?usage: trimtime-deploy <full-git-sha>}"
DIR="/opt/trimtime"
PIN=/etc/trimtime/image-sha
PREV=/etc/trimtime/image-sha.prev
COMPOSE=(docker compose --project-directory "$DIR" -f "$DIR/compose.yml")
HEALTH="http://127.0.0.1:3001/api/health"

if [[ ! -s /etc/trimtime/app.env ]]; then
  echo "Missing /etc/trimtime/app.env — run trimtime-fetch-env first." >&2
  exit 1
fi

LIVE="$(tr -d '[:space:]' < "$PIN" || true)"
if [[ -n "$LIVE" ]]; then
  printf '%s\n' "$LIVE" > "$PREV"
fi

aws ecr get-login-password --region "eu-central-1" \
  | docker login --username AWS --password-stdin "035611741535.dkr.ecr.eu-central-1.amazonaws.com/trimtime-app"

export TRIMTIME_SHA="$NEW_SHA"
"${COMPOSE[@]}" pull app
printf '%s\n' "$NEW_SHA" > "$PIN"
"${COMPOSE[@]}" up -d --force-recreate --remove-orphans app

ok=0
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH" >/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "Health check failed for $NEW_SHA. Attempting rollback to previous image." >&2
  echo "If a new migration already applied, rollback may fail. Fix forward or restore RDS to a new instance." >&2
  /usr/local/sbin/trimtime-rollback || true
  exit 1
fi

echo "Deployed $NEW_SHA"
curl -fsS "$HEALTH" || true
echo
EOF
chmod 0750 /usr/local/sbin/trimtime-deploy

cat > /usr/local/sbin/trimtime-rollback << 'EOF'
#!/bin/bash
# Restart the previous image SHA. Does NOT reverse Postgres migrations.
set -euo pipefail

DIR="/opt/trimtime"
PIN=/etc/trimtime/image-sha
PREV=/etc/trimtime/image-sha.prev
COMPOSE=(docker compose --project-directory "$DIR" -f "$DIR/compose.yml")
HEALTH="http://127.0.0.1:3001/api/health"

OLD="$(tr -d '[:space:]' < "$PREV" || true)"
if [[ -z "$OLD" ]]; then
  echo "No previous SHA in $PREV" >&2
  exit 1
fi

export TRIMTIME_SHA="$OLD"
printf '%s\n' "$OLD" > "$PIN"
"${COMPOSE[@]}" up -d --force-recreate --remove-orphans app

ok=0
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH" >/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "Rollback to $OLD failed health. Schema may be incompatible with this image." >&2
  exit 1
fi

echo "Rolled back to $OLD"
EOF
chmod 0750 /usr/local/sbin/trimtime-rollback

if [ ! -s /etc/trimtime/image-sha ]; then
  : > /etc/trimtime/image-sha
fi
if [ ! -s /etc/trimtime/image-sha.prev ]; then
  : > /etc/trimtime/image-sha.prev
fi
chmod 0644 /etc/trimtime/image-sha /etc/trimtime/image-sha.prev

if [ ! -f /etc/trimtime/app.env ]; then
  printf '%s\n' '# Rendered on the instance by /usr/local/sbin/trimtime-fetch-env' '# Do not copy secrets into Git.' > /etc/trimtime/app.env
fi
chmod 0600 /etc/trimtime/app.env
chown root:root /etc/trimtime/app.env

docker --version
docker compose version
test -x /usr/local/sbin/trimtime-deploy
test -x /usr/local/sbin/trimtime-fetch-env
test -x /usr/local/sbin/trimtime-rollback
test -f /opt/trimtime/compose.yml
test -f /etc/ssl/certs/rds-eu-central-1-bundle.pem
echo PROVISION_OK
