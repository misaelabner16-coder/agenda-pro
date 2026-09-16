export const SLOT_INTERVAL_MINUTES = 15;

export type WorkingInterval = { start: string; end: string };
export type CalendarInterval = { start: Date; end: Date };

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) throw new Error("Horário inválido.");
  return hours * 60 + minutes;
}

export function intervalsOverlap(first: CalendarInterval, second: CalendarInterval): boolean {
  return first.start < second.end && second.start < first.end;
}

function atLocalTime(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

/** Generates candidate booking slots. The database validates them again atomically. */
export function calculateAvailableSlots({ date, durationMinutes, workingIntervals, busyIntervals, now = new Date() }: {
  date: Date;
  durationMinutes: number;
  workingIntervals: WorkingInterval[];
  busyIntervals: CalendarInterval[];
  now?: Date;
}): CalendarInterval[] {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new Error("A duração do serviço deve ser maior que zero.");
  const slots: CalendarInterval[] = [];
  for (const interval of workingIntervals) {
    const startMinutes = timeToMinutes(interval.start);
    const endMinutes = timeToMinutes(interval.end);
    if (endMinutes <= startMinutes) throw new Error("O término do expediente deve ser posterior ao início.");
    for (let start = startMinutes; start + durationMinutes <= endMinutes; start += SLOT_INTERVAL_MINUTES) {
      const candidate = { start: atLocalTime(date, start), end: atLocalTime(date, start + durationMinutes) };
      if (candidate.start < now || busyIntervals.some((busy) => intervalsOverlap(candidate, busy))) continue;
      slots.push(candidate);
    }
  }
  return slots;
}
