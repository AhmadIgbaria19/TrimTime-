# Run on the EC2 via SSM after the instance role can read the RDS master secret.
# Fetches secrets on the box. Do not echo passwords.

set -eu
export AWS_DEFAULT_REGION=eu-central-1
export DEBIAN_FRONTEND=noninteractive

if ! command -v psql >/dev/null 2>&1; then
  apt-get update
  apt-get install -y postgresql-client
fi

SECRET_ARN='arn:aws:secretsmanager:eu-central-1:035611741535:secret:rds!db-c053d1ec-31d3-4e3c-89a7-deb7fac0f58e-2UsbnW'
PGHOST='trimtime-pg.cf6ekycck9fg.eu-central-1.rds.amazonaws.com'
PGSSLROOTCERT='/etc/ssl/certs/rds-eu-central-1-bundle.pem'

python3 - "$SECRET_ARN" "$PGHOST" "$PGSSLROOTCERT" << 'PY'
import json, os, subprocess, sys, tempfile

secret_arn, host, ca = sys.argv[1], sys.argv[2], sys.argv[3]
region = os.environ["AWS_DEFAULT_REGION"]

def aws_text(*args: str) -> str:
    return subprocess.check_output(["aws", *args], text=True).strip()

master = json.loads(
    aws_text(
        "secretsmanager", "get-secret-value",
        "--secret-id", secret_arn,
        "--query", "SecretString",
        "--output", "text",
        "--region", region,
    )
)
app_pw = aws_text(
    "ssm", "get-parameter",
    "--name", "/trimtime/prod/app/pgpassword",
    "--with-decryption",
    "--query", "Parameter.Value",
    "--output", "text",
    "--region", region,
)

sql = """
DO $body$
DECLARE
  pw text := %s;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trimtime_app') THEN
    EXECUTE format('CREATE ROLE trimtime_app LOGIN PASSWORD %%L', pw);
  ELSE
    EXECUTE format('ALTER ROLE trimtime_app LOGIN PASSWORD %%L', pw);
  END IF;
END
$body$;
GRANT CONNECT ON DATABASE trimtime TO trimtime_app;
GRANT USAGE, CREATE ON SCHEMA public TO trimtime_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO trimtime_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO trimtime_app;
"""

# Quote the password as a PostgreSQL string literal for the DO block assignment.
def pg_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"

sql = sql % pg_quote(app_pw)

env = os.environ.copy()
env["PGPASSWORD"] = master["password"]
env["PGUSER"] = master["username"]
env["PGHOST"] = host
env["PGPORT"] = "5432"
env["PGDATABASE"] = "trimtime"
env["PGSSLMODE"] = "verify-full"
env["PGSSLROOTCERT"] = ca

fd, path = tempfile.mkstemp(prefix="trimtime-bootstrap-", suffix=".sql")
os.close(fd)
os.chmod(path, 0o600)
try:
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(sql)
    subprocess.check_call(["psql", "-v", "ON_ERROR_STOP=1", "-f", path], env=env)
finally:
    try:
        os.remove(path)
    except OSError:
        pass
print("BOOTSTRAP_OK")
PY
