import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { expirePendingRowIfDue } from "./expire-pending-row.js";

const start = DateTime.fromISO("2026-09-13T10:00:00", { zone: "Asia/Jerusalem" });

describe("expirePendingRowIfDue", () => {
  it("does not expire a pending request before start", async () => {
    const queries: unknown[] = [];
    const client = {
      query: async (...args: unknown[]) => {
        queries.push(args);
        return { rows: [] };
      },
    };
    const did = await expirePendingRowIfDue(client as never, 7, "Pending", start, start.minus({ minutes: 1 }));
    assert.equal(did, false);
    assert.equal(queries.length, 0);
  });

  it("expires a pending request once start is reached", async () => {
    const queries: unknown[] = [];
    const client = {
      query: async (...args: unknown[]) => {
        queries.push(args);
        return { rows: [] };
      },
    };
    const did = await expirePendingRowIfDue(client as never, 7, "Pending", start, start);
    assert.equal(did, true);
    assert.equal(queries.length, 1);
  });

  it("leaves confirmed visits unchanged", async () => {
    const queries: unknown[] = [];
    const client = {
      query: async (...args: unknown[]) => {
        queries.push(args);
        return { rows: [] };
      },
    };
    const did = await expirePendingRowIfDue(client as never, 7, "Confirmed", start, start.plus({ minutes: 5 }));
    assert.equal(did, false);
    assert.equal(queries.length, 0);
  });
});
