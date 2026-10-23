import { randomUUID } from "node:crypto";

export type CalendarSinkEmailDeliveryKind = "initial" | "resend";

export function getCalendarSinkEmailIdempotencyKey(input: {
  attemptId?: string;
  feedId: string;
  kind: CalendarSinkEmailDeliveryKind;
}) {
  if (input.kind === "initial") {
    return `calendar-sink-created-${input.feedId}`;
  }

  return `calendar-sink-resend-${input.feedId}-${input.attemptId ?? randomUUID()}`;
}
