import { createHash } from "node:crypto";

import type {
  SquareJob,
  SquareScheduledShift,
  SquareTeamMember
} from "@/lib/square";

function escapeICalendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

function calendarTimestamp(value: string | Date) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldLine(line: string) {
  const chunks: string[] = [];
  let remaining = line;

  while (Buffer.byteLength(remaining, "utf8") > 73) {
    let index = Math.min(73, remaining.length);

    while (Buffer.byteLength(remaining.slice(0, index), "utf8") > 73) {
      index -= 1;
    }

    chunks.push(remaining.slice(0, index));
    remaining = remaining.slice(index);
  }

  chunks.push(remaining);
  return chunks.join("\r\n ");
}

export function buildSquareShiftCalendar(input: {
  calendarName: string;
  coworkerShifts: SquareScheduledShift[];
  jobs: SquareJob[];
  locations: Array<{ id: string; name?: string }>;
  shifts: SquareScheduledShift[];
  teamMembers: SquareTeamMember[];
}) {
  const locationNames = new Map(input.locations.map((location) => [location.id, location.name ?? "Work"]));
  const jobNames = new Map(input.jobs.map((job) => [job.id, job.title?.trim() || job.id]));
  const teamMemberNames = new Map(
    input.teamMembers.map((member) => [
      member.id,
      [member.given_name, member.family_name].filter(Boolean).join(" ") || member.id
    ])
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SLPCC63//Square Calendar Sink//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeICalendarText(input.calendarName)}`,
    "X-PUBLISHED-TTL:PT15M"
  ];

  for (const shift of input.shifts) {
    const details = shift.published_shift_details;

    if (!details || details.is_deleted) {
      continue;
    }

    const primaryName = details.team_member_id
      ? teamMemberNames.get(details.team_member_id) ?? details.team_member_id
      : "Employee";
    const role = jobNames.get(details.job_id) ?? details.job_id ?? "Role";
    const shiftStart = new Date(details.start_at).getTime();
    const shiftEnd = new Date(details.end_at).getTime();
    const coworker = input.coworkerShifts.find((candidate) => {
      const candidateDetails = candidate.published_shift_details;
      if (!candidateDetails || candidateDetails.is_deleted) return false;
      if (!candidateDetails.team_member_id || candidateDetails.team_member_id === details.team_member_id) return false;
      if (candidateDetails.location_id !== details.location_id) return false;

      return new Date(candidateDetails.start_at).getTime() < shiftEnd &&
        new Date(candidateDetails.end_at).getTime() > shiftStart;
    });
    const coworkerDetails = coworker?.published_shift_details;
    const coworkerSummary = coworkerDetails?.team_member_id
      ? ` with ${teamMemberNames.get(coworkerDetails.team_member_id) ?? coworkerDetails.team_member_id} (${jobNames.get(coworkerDetails.job_id) ?? coworkerDetails.job_id ?? "Role"})`
      : "";
    const summary = `${primaryName} shift as ${role}${coworkerSummary}`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeICalendarText(shift.id)}-${escapeICalendarText(details.team_member_id ?? "employee")}@square-calendar-sync.slpcc63.com`,
      `DTSTAMP:${calendarTimestamp(shift.updated_at ?? details.start_at)}`,
      `DTSTART:${calendarTimestamp(details.start_at)}`,
      `DTEND:${calendarTimestamp(details.end_at)}`,
      `SUMMARY:${escapeICalendarText(summary)}`,
      `LOCATION:${escapeICalendarText(locationNames.get(details.location_id) ?? "Work")}`,
      "DESCRIPTION:Read-only published work shift from Square. Make schedule changes in Square.",
      `SEQUENCE:${Math.max(0, shift.version ?? 0)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  const body = `${lines.map(foldLine).join("\r\n")}\r\n`;

  return {
    body,
    etag: `"${createHash("sha256").update(body).digest("hex")}"`
  };
}
