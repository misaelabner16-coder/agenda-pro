import { test } from "node:test";
import assert from "node:assert/strict";
import { validCalendarDate, shiftCalendarDate, eventTouchesDate } from "./calendar-view.ts";

test("calendar rejects invalid dates and navigates month/year boundaries", () => {
  assert.equal(validCalendarDate("2026-02-30"), false);
  assert.equal(validCalendarDate("invalid"), false);
  assert.equal(validCalendarDate("2028-02-29"), true);
  assert.equal(shiftCalendarDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftCalendarDate("2026-03-01", -1), "2026-02-28");
});
test("agenda uses location timezone, including overnight events and exclusive ends", () => {
  const zone = "America/Sao_Paulo";
  assert.equal(eventTouchesDate("2026-09-25T01:00:00Z", "2026-09-25T02:00:00Z", "2026-09-24", zone), true);
  assert.equal(eventTouchesDate("2026-09-25T02:00:00Z", "2026-09-25T03:00:00Z", "2026-09-25", zone), false);
  assert.equal(eventTouchesDate("2026-09-25T02:00:00Z", "2026-09-25T04:00:00Z", "2026-09-25", zone), true);
});
