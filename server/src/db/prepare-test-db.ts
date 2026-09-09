import pg from "pg";
import "../config.js";

const TEST_DB = process.env.PGDATABASE_TEST || "trimtime_test";

export async function prepareTestDatabase() {
  if (!/^[a-z][a-z0-9_]*$/.test(TEST_DB)) {
    throw new Error("PGDATABASE_TEST is not a safe database name.");
  }
  const liveDb = process.env.PGDATABASE || "trimtime";
  if (liveDb === TEST_DB) {
    throw new Error(`Refusing to reset ${TEST_DB}: PGDATABASE already points at the test database.`);
  }

  const admin = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: liveDb,
  });

  await admin.connect();
  try {
    const found = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB]);
    if (!found.rowCount) {
      await admin.query(`CREATE DATABASE ${TEST_DB}`);
      console.log("Created database", TEST_DB);
    }

    await admin.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB],
    );
  } finally {
    await admin.end();
  }

  const test = new pg.Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: TEST_DB,
  });
  await test.connect();
  try {
    await test.query("DROP SCHEMA public CASCADE");
    await test.query("CREATE SCHEMA public");
    await test.query("GRANT ALL ON SCHEMA public TO PUBLIC");
    console.log("Reset schema on", TEST_DB);
  } finally {
    await test.end();
  }

  return TEST_DB;
}
