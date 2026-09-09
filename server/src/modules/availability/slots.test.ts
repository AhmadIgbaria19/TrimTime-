import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { availableLocalTimes, subtractBusy, timeToMinutes } from "./slots.js";

describe("availableLocalTimes", () => {
  it("starts each free window at its beginning with a 30-minute step", () => {
    const work = [{ start: timeToMinutes("09:00"), end: timeToMinutes("12:00") }];
    const busy = [{ start: timeToMinutes("09:00"), end: timeToMinutes("09:30") }];
    assert.deepEqual(availableLocalTimes(work, busy, 30), [
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("uses a 40-minute step and keeps a 09:30–10:10 gap", () => {
    const work = [{ start: timeToMinutes("09:00"), end: timeToMinutes("12:00") }];
    const busy = [{ start: timeToMinutes("09:00"), end: timeToMinutes("09:30") }];
    assert.deepEqual(availableLocalTimes(work, busy, 40), ["09:30", "10:10", "10:50"]);
  });

  it("offers exactly one 40-minute slot in a 09:30–10:10 gap", () => {
    const free = subtractBusy(
      [{ start: timeToMinutes("09:00"), end: timeToMinutes("12:00") }],
      [
        { start: timeToMinutes("09:00"), end: timeToMinutes("09:30") },
        { start: timeToMinutes("10:10"), end: timeToMinutes("12:00") },
      ],
    );
    assert.deepEqual(availableLocalTimes(free, [], 40), ["09:30"]);
  });

  it("does not place a slot that crosses a barrier", () => {
    const work = [{ start: timeToMinutes("10:00"), end: timeToMinutes("12:00") }];
    const busy = [{ start: timeToMinutes("10:30"), end: timeToMinutes("11:00") }];
    const slots = availableLocalTimes(work, busy, 40);
    assert.equal(slots.includes("10:00"), false);
    assert.deepEqual(slots, ["11:00"]);
  });
});
