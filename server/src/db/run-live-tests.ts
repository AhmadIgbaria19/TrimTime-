import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareTestDatabase } from "./prepare-test-db.js";

const require = createRequire(import.meta.url);
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEST_DB = process.env.PGDATABASE_TEST || "trimtime_test";
const tsxCli = path.join(path.dirname(require.resolve("tsx/package.json")), "dist/cli.mjs");

const files = ["src/phase2-readiness.live.test.ts", "src/modules/bookings/booking-gaps.live.test.ts"];

function runFile(file: string, testDb: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, "--test", "--test-concurrency=1", file], {
      cwd: serverRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        PGDATABASE: testDb,
      },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${file} exited with ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${file} failed with exit code ${code}`));
        return;
      }
      resolve();
    });
  });
}

const testDb = await prepareTestDatabase();
for (const file of files) {
  await runFile(file, testDb || TEST_DB);
}
