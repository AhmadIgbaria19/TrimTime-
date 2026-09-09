import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { evaluateCancel } from "./cancel-policy.js";

const start = DateTime.fromISO("2026-09-13T10:00:00", { zone: "Asia/Jerusalem" });

describe("evaluateCancel", () => {
  it("lets a customer withdraw a pending booking before it starts", () => {
    const now = start.minus({ minutes: 30 });
    assert.deepEqual(
      evaluateCancel({ status: "Pending", startAt: start, now, cancellationHours: 2 }),
      { allowed: true },
    );
  });

  it("blocks cancelling a confirmed visit inside the notice window", () => {
    const now = start.minus({ hours: 1 });
    const result = evaluateCancel({ status: "Confirmed", startAt: start, now, cancellationHours: 2 });
    assert.equal(result.allowed, false);
  });

  it("allows cancelling a confirmed visit with enough notice", () => {
    const now = start.minus({ hours: 2, minutes: 1 });
    assert.deepEqual(
      evaluateCancel({ status: "Confirmed", startAt: start, now, cancellationHours: 2 }),
      { allowed: true },
    );
  });

  it("rejects a second cancel", () => {
    const result = evaluateCancel({
      status: "Cancelled",
      startAt: start,
      now: start.minus({ hours: 5 }),
      cancellationHours: 2,
    });
    assert.equal(result.allowed, false);
  });

  it("does not let a customer cancel an expired request", () => {
    const result = evaluateCancel({
      status: "Expired",
      startAt: start,
      now: start.plus({ minutes: 5 }),
      cancellationHours: 2,
    });
    assert.equal(result.allowed, false);
  });
});
