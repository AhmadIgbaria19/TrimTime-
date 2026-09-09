import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if (applied.rowCount) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, name), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await pool.query("COMMIT");
      console.log("Applied migration", name);
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}

const isCli = process.argv[1]?.includes("migrate");
if (isCli) {
  migrate()
    .then(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
