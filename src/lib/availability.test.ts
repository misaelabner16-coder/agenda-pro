import assert from "node:assert/strict";
import test from "node:test";
import { calculateAvailableSlots, intervalsOverlap } from "./availability.ts";

const day = new Date("2026-09-16T00:00:00");
const now = new Date("2026-09-15T12:00:00");

test("calcula somente horários que cabem no expediente", () => {
  const slots = calculateAvailableSlots({ date: day, durationMinutes: 45, workingIntervals: [{ start: "09:00", end: "10:00" }], busyIntervals: [], now });
  assert.deepEqual(slots.map((slot) => slot.start.toTimeString().slice(0, 5)), ["09:00", "09:15"]);
});

test("serviço de 60 minutos não oferece 11:30 em expediente até 12:00", () => {
  const slots = calculateAvailableSlots({
    date: day,
    durationMinutes: 60,
    workingIntervals: [{ start: "09:00", end: "12:00" }],
    busyIntervals: [],
    now,
  });
  assert.equal(slots.some((slot) => slot.start.toTimeString().slice(0, 5) === "11:30"), false);
  assert.equal(slots.at(-1)?.start.toTimeString().slice(0, 5), "11:00");
});

test("remove qualquer horário que se sobrepõe a uma reserva ou bloqueio", () => {
  const slots = calculateAvailableSlots({
    date: day, durationMinutes: 30, workingIntervals: [{ start: "09:00", end: "11:00" }],
    busyIntervals: [{ start: new Date("2026-09-16T09:30:00"), end: new Date("2026-09-16T10:15:00") }], now,
  });
  assert.deepEqual(slots.map((slot) => slot.start.toTimeString().slice(0, 5)), ["09:00", "10:15", "10:30"]);
});

test("bloqueio 10:30–11:30 remove todos os serviços de 60 minutos que o atravessam", () => {
  const slots = calculateAvailableSlots({
    date: day,
    durationMinutes: 60,
    workingIntervals: [{ start: "09:00", end: "12:00" }],
    busyIntervals: [{ start: new Date("2026-09-16T10:30:00"), end: new Date("2026-09-16T11:30:00") }],
    now,
  });
  assert.deepEqual(slots.map((slot) => slot.start.toTimeString().slice(0, 5)), ["09:00", "09:15", "09:30"]);
});

test("não oferece horários no passado nem atravessa pausa entre expedientes", () => {
  const slots = calculateAvailableSlots({
    date: day,
    durationMinutes: 60,
    workingIntervals: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }],
    busyIntervals: [],
    now: new Date("2026-09-16T10:20:00"),
  });
  const times = slots.map((slot) => slot.start.toTimeString().slice(0, 5));
  assert.equal(times.includes("10:15"), false);
  assert.equal(times.includes("11:30"), false);
  assert.equal(times.includes("12:00"), false);
  assert.equal(times.includes("13:00"), true);
});

test("intervalos consecutivos não conflitam, mas qualquer sobreposição conflita", () => {
  const first = { start: new Date("2026-09-16T09:00:00"), end: new Date("2026-09-16T09:30:00") };
  assert.equal(intervalsOverlap(first, { start: new Date("2026-09-16T09:30:00"), end: new Date("2026-09-16T10:00:00") }), false);
  assert.equal(intervalsOverlap(first, { start: new Date("2026-09-16T09:15:00"), end: new Date("2026-09-16T09:45:00") }), true);
});
