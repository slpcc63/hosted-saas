export type CalendarSinkAccessState = "active" | "not_found" | "paused";

export function getCalendarSinkAccessState(settings: { enabled: boolean } | null) {
  if (!settings) return "not_found" as const;
  return settings.enabled ? "active" as const : "paused" as const;
}
