import "server-only";

export type TwilioMessageResult = {
  errorCode: number | null;
  errorMessage: string | null;
  sid: string;
  status: string;
};

function getTwilioConfiguration() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID?.trim() ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN?.trim() ?? "",
    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? ""
  };
}

export function isTwilioMessagingConfigured() {
  const configuration = getTwilioConfiguration();
  return Boolean(
    configuration.accountSid &&
    configuration.authToken &&
    configuration.messagingServiceSid
  );
}

export function isTimeCardSmsLive() {
  return process.env.TIME_CARD_TEXTING_LIVE === "true" && isTwilioMessagingConfigured();
}

export function getTwilioAuthToken() {
  return getTwilioConfiguration().authToken;
}

export async function sendTwilioMessage(input: {
  body: string;
  statusCallback?: string;
  to: string;
}) {
  const configuration = getTwilioConfiguration();

  if (!isTwilioMessagingConfigured()) {
    throw new Error("Twilio messaging is not configured");
  }

  const form = new URLSearchParams({
    Body: input.body,
    MessagingServiceSid: configuration.messagingServiceSid,
    To: input.to
  });

  if (input.statusCallback) {
    form.set("StatusCallback", input.statusCallback);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(configuration.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${configuration.accountSid}:${configuration.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    }
  );
  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    sid?: string;
    status?: string;
  };

  if (!response.ok || !payload.sid) {
    throw new Error(payload.message || "Twilio message delivery failed");
  }

  return {
    errorCode: payload.code ?? null,
    errorMessage: payload.message ?? null,
    sid: payload.sid,
    status: payload.status ?? "queued"
  } satisfies TwilioMessageResult;
}

