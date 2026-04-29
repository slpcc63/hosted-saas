import "server-only";

const fallbackFromEmail = "notifications@slpcc63.com";
const reservedLocalParts = new Set([
  "abuse",
  "admin",
  "billing",
  "help",
  "mailer-daemon",
  "noreply",
  "notifications",
  "postmaster",
  "security",
  "support"
]);

export type ManagedSenderLocalPartParseResult = {
  error: string | null;
  normalized: string | null;
};

export type SendTransactionalEmailInput = {
  fromEmail?: string;
  fromName?: string;
  html: string;
  replyTo?: string;
  subject: string;
  text?: string;
  to: string | string[];
};

function getConfiguredFallbackFromEmail() {
  return (process.env.RESEND_FROM_EMAIL?.trim().toLowerCase() || fallbackFromEmail).trim();
}

function formatFromHeader(input: { email: string; name?: string }) {
  if (!input.name?.trim()) {
    return input.email;
  }

  return `${input.name.trim()} <${input.email}>`;
}

export function getManagedSenderDomain() {
  return getConfiguredFallbackFromEmail().split("@")[1] ?? "slpcc63.com";
}

export function getDefaultManagedSenderEmail() {
  return getConfiguredFallbackFromEmail();
}

export function parseManagedSenderLocalPart(value: string): ManagedSenderLocalPartParseResult {
  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return {
      normalized: null,
      error: null
    };
  }

  const candidate = trimmed.includes("@") ? trimmed.split("@")[0] ?? "" : trimmed;
  const normalized = candidate
    .replace(/[^a-z0-9.-]+/g, "")
    .replace(/[.-]{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 40);

  if (!normalized || normalized.length < 3) {
    return {
      normalized: null,
      error: "Sender address must be at least 3 characters long."
    };
  }

  if (reservedLocalParts.has(normalized)) {
    return {
      normalized: null,
      error: "That sender address is reserved. Please choose another one."
    };
  }

  return {
    normalized,
    error: null
  };
}

export function resolveManagedSenderEmail(localPart?: string | null) {
  const parsed = parseManagedSenderLocalPart(localPart ?? "");

  if (!parsed.normalized) {
    return getDefaultManagedSenderEmail();
  }

  return `${parsed.normalized}@${getManagedSenderDomain()}`;
}

export async function sendTransactionalEmail(input: SendTransactionalEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: formatFromHeader({
        email: input.fromEmail?.trim() || getDefaultManagedSenderEmail(),
        name: input.fromName
      }),
      to: Array.isArray(input.to) ? input.to : [input.to],
      reply_to: input.replyTo?.trim() || undefined,
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    id?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Resend email delivery failed");
  }

  return payload;
}
