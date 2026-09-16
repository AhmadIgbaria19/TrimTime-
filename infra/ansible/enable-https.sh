#!/bin/bash
# Run on the TrimTime EC2 after Namecheap A records point at the Elastic IP.
# Certificate + nginx match infra/ansible/templates/nginx-trimtime.conf.j2
# (enable_https true, canonical_host lamsabarber.com).
set -eu
export DEBIAN_FRONTEND=noninteractive

DOMAIN="lamsabarber.com"
EIP="63.188.200.186"

apt-get update
apt-get install -y certbot python3-certbot-nginx
install -d -m 0755 /var/www/html

# Use the VPC resolver (egress UDP/53 to public NS is not open).
apex="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}')"
www="$(getent ahostsv4 "www.$DOMAIN" | awk '{print $1; exit}')"
if [ "$apex" != "$EIP" ] || [ "$www" != "$EIP" ]; then
  echo "DNS is not ready. Apex=$apex www=$www expected=$EIP" >&2
  exit 1
fi

cat > /etc/nginx/sites-available/trimtime << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name lamsabarber.com www.lamsabarber.com _;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

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

nginx -t
systemctl reload nginx

certbot certonly --webroot \
  -w /var/www/html \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --keep-until-expiring

cat > /etc/nginx/sites-available/trimtime << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name lamsabarber.com www.lamsabarber.com _;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://lamsabarber.com$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.lamsabarber.com;

    ssl_certificate /etc/letsencrypt/live/lamsabarber.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lamsabarber.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    return 301 https://lamsabarber.com$request_uri;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name lamsabarber.com;

    ssl_certificate /etc/letsencrypt/live/lamsabarber.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lamsabarber.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer

python3 - << 'PY'
from pathlib import Path

script = Path("/usr/local/sbin/trimtime-fetch-env")
if script.exists():
    text = script.read_text()
    if "COOKIE_SECURE=" not in text:
        needle = 'echo "PGSSLROOTCERT=/etc/ssl/certs/rds-eu-central-1-bundle.pem"'
        insert = needle + '\n  echo "COOKIE_SECURE=true"'
        if needle not in text:
            raise SystemExit("fetch-env missing PGSSLROOTCERT line")
        script.write_text(text.replace(needle, insert, 1))

env = Path("/etc/trimtime/app.env")
if env.exists():
    text = env.read_text()
    if "COOKIE_SECURE=" not in text:
        if text and not text.endswith("\n"):
            text += "\n"
        env.write_text(text + "COOKIE_SECURE=true\n")
PY

certbot renew --dry-run
echo HTTPS_OK
curl -fsS "https://$DOMAIN/api/health"
echo
systemctl is-active certbot.timer
echo
