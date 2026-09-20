// Timezone helpers built on Intl, so no dependency and no reliance on the
// server's own clock. This matters because the app runs on Render (UTC) but
// every theater is in India: "prime time, 6-10pm" has to mean 6-10pm where
// the cinema is, not wherever the process happens to be running.

// Every theater in this app is Indian; used when a record predates the
// timezone field or a caller has no theater in hand.
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const partsIn = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23", // 00-23; plain hour12:false can yield "24" for midnight
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
};

/**
 * Local wall-clock weekday and hour of an instant, in the given timezone.
 * @returns {{ weekday: string, hour: number, isWeekend: boolean }}
 */
export const zonedWeekdayAndHour = (date, timeZone = DEFAULT_TIMEZONE) => {
  const { weekday, hour } = partsIn(new Date(date), timeZone);
  return {
    weekday,
    hour: Number(hour),
    isWeekend: weekday === "Sat" || weekday === "Sun",
  };
};

// How far the zone is from UTC at that instant, derived by reading the same
// moment as wall-clock time in the zone and diffing. India has no DST, but
// doing it per-instant keeps this correct for zones that do.
const offsetMs = (date, timeZone) => {
  const p = partsIn(date, timeZone);
  const asIfUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asIfUtc - date.getTime();
};

/**
 * The UTC instants bounding one calendar day in a timezone — what "show me
 * showtimes on 2026-09-19" has to mean for a cinema, rather than a day
 * measured against the server's clock.
 * @param {string} dateInput - anything Date can parse, e.g. "2026-09-19"
 * @returns {{ start: Date, end: Date }} start inclusive, end exclusive
 */
export const zonedDayRange = (dateInput, timeZone = DEFAULT_TIMEZONE) => {
  // A date-only string names a calendar day outright, so take it literally.
  // Parsing it as a Date first would read it as UTC midnight, which is the
  // *previous* day in any zone behind UTC (e.g. "2026-07-15" would become
  // July 14th in New York).
  const dateOnly = typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim());
  const [year, month, day] = dateOnly
    ? dateInput.trim().split("-").map(Number)
    : (({ year, month, day }) => [Number(year), Number(month), Number(day)])(
        partsIn(new Date(dateInput), timeZone)
      );
  const midnightAsUtc = Date.UTC(year, month - 1, day);

  // First guess assumes the offset at that UTC instant, then corrects using
  // the offset actually in force at the resulting local midnight.
  const firstGuess = new Date(midnightAsUtc - offsetMs(new Date(midnightAsUtc), timeZone));
  const start = new Date(midnightAsUtc - offsetMs(firstGuess, timeZone));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
};
