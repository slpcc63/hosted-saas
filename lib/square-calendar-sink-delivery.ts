import "server-only";

import {
  getCalendarSinkEmailIdempotencyKey,
  type CalendarSinkEmailDeliveryKind
} from "@/lib/calendar-sink-delivery-identity";
import { getCalendarSinkReplyToEmail } from "@/lib/calendar-sink-email";
import { getCalendarSinkDeliveryPlan } from "@/lib/calendar-sink-delivery-plan";
import type { CustomerProfile } from "@/lib/customers";
import { getDefaultManagedSenderEmail, sendTransactionalEmail } from "@/lib/email";
import {
  recordSquareCalendarSinkDelivery,
  type SquareCalendarSinkSettings
} from "@/lib/square-calendar-sink";
import type { SquareTeamMember } from "@/lib/square";

export type CalendarSinkDistributionMode = "email" | "manual";

export type CalendarSinkDistributionResult = {
  createdCount: number;
  failedCount: number;
  manualCount: number;
  missingContactCount: number;
  sentCount: number;
};

type CreatedCalendarFeed = {
  feed: SquareCalendarSinkSettings;
  teamMember: SquareTeamMember;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTeamMemberName(member: SquareTeamMember) {
  return [member.given_name, member.family_name].filter(Boolean).join(" ") || member.id;
}

function emptyResult(createdCount: number): CalendarSinkDistributionResult {
  return {
    createdCount,
    failedCount: 0,
    manualCount: 0,
    missingContactCount: 0,
    sentCount: 0
  };
}

export async function distributeSquareCalendarSinkFeeds(input: {
  created: CreatedCalendarFeed[];
  customer: Pick<CustomerProfile, "companyName" | "contactName" | "email" | "id">;
  deliveryKind?: CalendarSinkEmailDeliveryKind;
  mode: CalendarSinkDistributionMode;
  setupBaseUrl: string;
}) {
  const result = emptyResult(input.created.length);
  const companyName = input.customer.companyName?.trim() || "Your employer";
  const senderName = `${companyName} via SLPCC63`;

  for (const { feed, teamMember } of input.created) {
    const plan = getCalendarSinkDeliveryPlan({
      emailAddress: teamMember.email_address,
      feedToken: feed.feedToken,
      mode: input.mode,
      setupBaseUrl: input.setupBaseUrl
    });

    if (plan.status === "manual") {
      await recordSquareCalendarSinkDelivery({
        channel: "manual",
        customerId: input.customer.id,
        feedId: feed.id,
        status: "manual"
      });
      result.manualCount += 1;
      continue;
    }

    if (plan.status === "needs_contact") {
      await recordSquareCalendarSinkDelivery({
        channel: "email",
        customerId: input.customer.id,
        feedId: feed.id,
        status: "needs_contact"
      });
      result.missingContactCount += 1;
      continue;
    }

    const employeeName = getTeamMemberName(teamMember);
    const recipient = plan.recipient;
    const setupUrl = plan.setupUrl;
    const subject = `${companyName}: add your work schedule`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2933;">
        <h1 style="margin-bottom: 0.5rem;">Add your work schedule</h1>
        <p>Hello ${escapeHtml(employeeName)},</p>
        <p>
          ${escapeHtml(companyName)} created a private, read-only calendar for your
          published Square shifts.
        </p>
        <p>You do not need an SLPCC63 account. Open the page and set up your calendar once.</p>
        <p>
          <a href="${escapeHtml(setupUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #111111; color: #ffffff; text-decoration: none;">
            Open your private setup page
          </a>
        </p>
        <p><strong>Do not forward this link.</strong> Anyone with it can view your work schedule.</p>
        <p>Schedule changes must still be made in Square. The subscribed calendar is read-only.</p>
      </div>
    `;
    const text = [
      `Hello ${employeeName},`,
      "",
      `${companyName} created a private, read-only calendar for your published Square shifts.`,
      "You do not need an SLPCC63 account. Open the page and set up your calendar once.",
      "",
      `Open your private setup page: ${setupUrl}`,
      "",
      "Do not forward this link. Anyone with it can view your work schedule.",
      "Schedule changes must still be made in Square. The subscribed calendar is read-only."
    ].join("\n");

    try {
      const email = await sendTransactionalEmail({
        fromEmail: getDefaultManagedSenderEmail(),
        fromName: senderName,
        html,
        idempotencyKey: getCalendarSinkEmailIdempotencyKey({
          feedId: feed.id,
          kind: input.deliveryKind ?? "initial"
        }),
        replyTo: getCalendarSinkReplyToEmail(),
        subject,
        text,
        to: recipient
      });
      await recordSquareCalendarSinkDelivery({
        channel: "email",
        customerId: input.customer.id,
        feedId: feed.id,
        providerMessageId: email.id ?? null,
        recipient,
        status: "sent"
      });
      result.sentCount += 1;
    } catch (error) {
      await recordSquareCalendarSinkDelivery({
        channel: "email",
        customerId: input.customer.id,
        errorMessage: error instanceof Error ? error.message : "Email delivery failed",
        feedId: feed.id,
        recipient,
        status: "failed"
      });
      result.failedCount += 1;
    }
  }

  return result;
}
