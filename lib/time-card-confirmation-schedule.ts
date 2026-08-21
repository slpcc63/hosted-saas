const weekdayIndexByLabel = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6]
]);

function getMinuteOfWeek(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const weekday = weekdayIndexByLabel.get(
    parts.find((part) => part.type === "weekday")?.value ?? "Sun"
  ) ?? 0;
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return weekday * 24 * 60 + hour * 60 + minute;
}

export function isWeeklyConfirmationScheduleDue(input: {
  dayOfWeek: number;
  now: Date;
  timeLocal: string;
  timezone: string;
  windowMinutes: number;
}) {
  const current = getMinuteOfWeek(input.now, input.timezone);
  const previous = getMinuteOfWeek(
    new Date(input.now.getTime() - input.windowMinutes * 60 * 1000),
    input.timezone
  );
  const [hour, minute] = input.timeLocal.split(":").map(Number);
  const scheduled = input.dayOfWeek * 24 * 60 + hour * 60 + minute;

  return previous <= current
    ? scheduled > previous && scheduled <= current
    : scheduled > previous || scheduled <= current;
}

function getLocalDateString(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function shiftDateString(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildCompletedConfirmationPeriod(input: {
  now: Date;
  periodDays: number;
  timezone: string;
}) {
  const localToday = getLocalDateString(input.now, input.timezone);
  const periodEnd = shiftDateString(localToday, -1);
  const periodStart = shiftDateString(periodEnd, -(input.periodDays - 1));
  return { periodEnd, periodStart };
}
