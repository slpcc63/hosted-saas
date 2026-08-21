import type { TimeCardConfirmationRequest } from "@/lib/time-card-email-workflow";

export type TimeCardReportFilters = {
  employee?: string;
  periodEnd?: string;
  periodStart?: string;
  status?: string;
};

const reportStatuses = new Set([
  "approved",
  "delivery_failed",
  "overdue",
  "pending",
  "rejected",
  "responded"
]);

export function isTimeCardRequestOverdue(
  request: TimeCardConfirmationRequest,
  now = new Date()
) {
  return request.status === "pending" && request.tokenExpiresAt.getTime() <= now.getTime();
}

export function filterTimeCardConfirmationRequests(
  requests: TimeCardConfirmationRequest[],
  filters: TimeCardReportFilters,
  now = new Date()
) {
  const employee = filters.employee?.trim().toLowerCase() ?? "";
  const status = reportStatuses.has(filters.status ?? "") ? filters.status : "";

  return requests.filter((request) => {
    if (employee && !request.employeeName.toLowerCase().includes(employee)) {
      return false;
    }

    if (filters.periodStart && request.periodEnd < filters.periodStart) {
      return false;
    }

    if (filters.periodEnd && request.periodStart > filters.periodEnd) {
      return false;
    }

    if (status === "overdue") {
      return isTimeCardRequestOverdue(request, now);
    }

    return !status || request.status === status;
  });
}

function protectSpreadsheetFormula(value: string) {
  return /^[\t ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: unknown) {
  const normalized = value instanceof Date
    ? value.toISOString()
    : value === null || value === undefined
      ? ""
      : String(value);
  return `"${protectSpreadsheetFormula(normalized).replaceAll('"', '""')}"`;
}

export function buildTimeCardReportCsv(requests: TimeCardConfirmationRequest[], now = new Date()) {
  const rows = requests.map((request) => [
    request.employeeName,
    request.employeeEmail,
    request.periodStart,
    request.periodEnd,
    isTimeCardRequestOverdue(request, now) ? "overdue" : request.status,
    request.responseCode === "a" ? "did not work" : request.responseCode === "b" ? "worked" : "",
    request.reportedShiftDate,
    request.reportedTimeIn,
    request.reportedTimeOut,
    request.responseNote,
    request.managerNote,
    request.sentAt,
    request.respondedAt,
    request.reviewedAt,
    request.reminderCount
  ]);
  const header = [
    "Employee",
    "Email",
    "Period start",
    "Period end",
    "Status",
    "Response",
    "Shift date",
    "Time in",
    "Time out",
    "Employee note",
    "Manager note",
    "Sent at",
    "Responded at",
    "Reviewed at",
    "Reminder count"
  ];

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
