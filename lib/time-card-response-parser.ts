export type ParsedEmployeeTimeResponse =
  | { code: "a" }
  | { code: "b"; timeIn: string; timeOut: string };

function normalizeTime(value: string) {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3];

  if (minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }

    if (hour === 12) {
      hour = 0;
    }

    if (meridiem === "pm") {
      hour += 12;
    }
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function parseEmployeeTimeResponse(value: string): ParsedEmployeeTimeResponse | null {
  const normalized = value.trim().toLowerCase();

  if (normalized === "a") {
    return { code: "a" };
  }

  const workedMatch = normalized.match(/^b\s*\+\s*(.+?)\s*-\s*(.+)$/);

  if (!workedMatch) {
    return null;
  }

  const timeIn = normalizeTime(workedMatch[1]);
  const timeOut = normalizeTime(workedMatch[2]);

  if (!timeIn || !timeOut) {
    return null;
  }

  return { code: "b", timeIn, timeOut };
}
