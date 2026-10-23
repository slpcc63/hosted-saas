export function getCalendarSinkDeliveryPlan(input: {
  emailAddress?: string;
  feedToken: string;
  mode: "email" | "manual";
  setupBaseUrl: string;
}) {
  if (input.mode === "manual") {
    return {
      channel: "manual" as const,
      recipient: null,
      setupUrl: null,
      status: "manual" as const
    };
  }

  const recipient = input.emailAddress?.trim().toLowerCase() || null;

  if (!recipient) {
    return {
      channel: "email" as const,
      recipient: null,
      setupUrl: null,
      status: "needs_contact" as const
    };
  }

  return {
    channel: "email" as const,
    recipient,
    setupUrl: `${input.setupBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(input.feedToken)}`,
    status: "ready" as const
  };
}
