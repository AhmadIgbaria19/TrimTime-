import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import { evaluateAdminAction, actionsFor } from "./admin-actions.js";

const start = DateTime.fromISO("2026-09-13T10:00:00", { zone: "Asia/Jerusalem" });

describe("evaluateAdminAction", () => {
  it("confirms a pending request before start", () => {
    const result = evaluateAdminAction({
      status: "Pending",
      action: "confirm",
      startAt: start,
      now: start.minus({ days: 2 }),
    });
    assert.equal(result.allowed, true);
  });

  it("blocks confirm at or after the appointment start", () => {
    const result = evaluateAdminAction({
      status: "Pending",
      action: "confirm",
      startAt: start,
      now: start,
    });
    assert.equal(result.allowed, false);
    if (!result.allowed) {
      assert.match(result.error, /expired/i);
    }
  });

  it("blocks complete before the appointment starts", () => {
    const result = evaluateAdminAction({
      status: "Confirmed",
      action: "complete",
      startAt: start,
      now: start.minus({ minutes: 1 }),
    });
    assert.equal(result.allowed, false);
  });

  it("allows complete from the start time", () => {
    const result = evaluateAdminAction({
      status: "Confirmed",
      action: "complete",
      startAt: start,
      now: start,
    });
    assert.equal(result.allowed, true);
  });

  it("blocks no-show on a future confirmed visit", () => {
    const result = evaluateAdminAction({
      status: "Confirmed",
      action: "no-show",
      startAt: start,
      now: start.minus({ hours: 3 }),
    });
    assert.equal(result.allowed, false);
  });

  it("allows salon cancel of a confirmed visit after start", () => {
    const result = evaluateAdminAction({
      status: "Confirmed",
      action: "cancel",
      startAt: start,
      now: start.plus({ minutes: 10 }),
    });
    assert.equal(result.allowed, true);
    if (result.allowed) {
      assert.equal(result.nextStatus, "Cancelled");
    }
  });

  it("does not treat complete or no-show as the salon-cancel path", () => {
    const after = evaluateAdminAction({
      status: "Confirmed",
      action: "cancel",
      startAt: start,
      now: start.plus({ hours: 1 }),
    });
    assert.equal(after.allowed, true);
    if (after.allowed) {
      assert.equal(after.nextStatus, "Cancelled");
    }
  });

  it("returns disabled complete/no-show and enabled cancel before start", () => {
    const states = actionsFor("Confirmed", start, start.minus({ minutes: 5 }));
    assert.deepEqual(
      states.map((item) => ({ action: item.action, enabled: item.enabled })),
      [
        { action: "complete", enabled: false },
        { action: "no-show", enabled: false },
        { action: "cancel", enabled: true },
      ],
    );
  });
});
