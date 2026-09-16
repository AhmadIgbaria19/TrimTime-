import fs from "node:fs";
import "../config.js";
import pg from "pg";

const { Pool } = pg;

function sslConfig() {
  const caPath = process.env.PGSSLROOTCERT;
  if (!caPath) {
    return undefined;
  }
  return {
    rejectUnauthorized: true,
    ca: fs.readFileSync(caPath, "utf8"),
  };
}

export const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: sslConfig(),
});
