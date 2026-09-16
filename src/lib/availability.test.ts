import assert from "node:assert/strict";
import test from "node:test";
import { calculateAvailableSlots, intervalsOverlap } from "./availability.ts";

const day = new Date("2026-09-16T00:00:00");
const now = new Date("2026-09-15T12:00:00");

test("calcula somente horários que cabem no expediente", () => {
  const slots = calculateAvailableSlots({ date: day, durationMinutes: 45, workingIntervals: [{ start: "09:00", end: "10:00" }], busyIntervals: [], now });
  assert.deepEqual(slots.map((slot) => slot.start.toTimeString().slice(0, 5)), ["09:00", "09:15"]);
});

test("remove qualquer horário que se sobrepõe a uma reserva ou bloqueio", () => {
  const slots = calculateAvailableSlots({
    date: day, durationMinutes: 30, workingIntervals: [{ start: "09:00", end: "11:00" }],
    busyIntervals: [{ start: new Date("2026-09-16T09:30:00"), end: new Date("2026-09-16T10:15:00") }], now,
  });
  assert.deepEqual(slots.map((slot) => slot.start.toTimeString().slice(0, 5)), ["09:00", "10:15", "10:30"]);
});

test("intervalos consecutivos não conflitam, mas qualquer sobreposição conflita", () => {
  const first = { start: new Date("2026-09-16T09:00:00"), end: new Date("2026-09-16T09:30:00") };
  assert.equal(intervalsOverlap(first, { start: new Date("2026-09-16T09:30:00"), end: new Date("2026-09-16T10:00:00") }), false);
  assert.equal(intervalsOverlap(first, { start: new Date("2026-09-16T09:15:00"), end: new Date("2026-09-16T09:45:00") }), true);
});
