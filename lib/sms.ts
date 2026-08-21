import "server-only";

export type SendTransactionalTextInput = {
  body: string;
  to: string;
};

function getTwilioAccountSid() {
  return process.env.TWILIO_ACCOUNT_SID?.trim() || "";
}

function getTwilioAuthToken() {
  return process.env.TWILIO_AUTH_TOKEN?.trim() || "";
}

function getTwilioFromNumber() {
  return process.env.TWILIO_FROM_NUMBER?.trim() || "";
}

function getTwilioMessagingServiceSid() {
  return process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || "";
}

export function isTransactionalTextingConfigured() {
  const accountSid = getTwilioAccountSid();
  const authToken = getTwilioAuthToken();
  const fromNumber = getTwilioFromNumber();
  const messagingServiceSid = getTwilioMessagingServiceSid();

  return Boolean(accountSid && authToken && (fromNumber || messagingServiceSid));
}

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/[^\d+]/g, "");

  if (sanitized.startsWith("+")) {
    const digits = sanitized.slice(1);

    if (/^\d{10,15}$/.test(digits)) {
      return `+${digits}`;
    }

    return null;
  }

  const digitsOnly = sanitized.replace(/\D/g, "");

  if (/^\d{10}$/.test(digitsOnly)) {
    return `+1${digitsOnly}`;
  }

  if (/^1\d{10}$/.test(digitsOnly)) {
    return `+${digitsOnly}`;
  }

  return null;
}

export async function sendTransactionalText(input: SendTransactionalTextInput) {
  const accountSid = getTwilioAccountSid();
  const authToken = getTwilioAuthToken();
  const fromNumber = getTwilioFromNumber();
  const messagingServiceSid = getTwilioMessagingServiceSid();

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
    throw new Error("Twilio SMS is not configured");
  }

  const normalizedTo = normalizePhoneNumber(input.to);

  if (!normalizedTo) {
    throw new Error("Recipient phone number is invalid");
  }

  const body = new URLSearchParams({
    To: normalizedTo,
    Body: input.body.trim()
  });

  if (messagingServiceSid) {
    body.set("MessagingServiceSid", messagingServiceSid);
  } else {
    body.set("From", fromNumber);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    }
  );

  const payload = (await response.json()) as {
    message?: string;
    sid?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || "Twilio SMS delivery failed");
  }

  return payload;
}
