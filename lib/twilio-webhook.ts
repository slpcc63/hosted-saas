import { createHmac, timingSafeEqual } from "node:crypto";

export type TwilioWebhookParameters = Record<string, string | string[]>;

function appendParameterValues(value: string | string[]) {
  return Array.isArray(value) ? [...value].sort() : [value];
}

export function computeTwilioSignature(input: {
  authToken: string;
  parameters: TwilioWebhookParameters;
  url: string;
}) {
  const payload = Object.keys(input.parameters)
    .sort()
    .reduce((value, key) => {
      const parameterValues = appendParameterValues(input.parameters[key]);
      return `${value}${parameterValues.map((entry) => `${key}${entry}`).join("")}`;
    }, input.url);

  return createHmac("sha1", input.authToken).update(payload).digest("base64");
}

export function validateTwilioSignature(input: {
  authToken: string;
  parameters: TwilioWebhookParameters;
  signature: string;
  url: string;
}) {
  if (!input.authToken || !input.signature) {
    return false;
  }

  const expected = Buffer.from(computeTwilioSignature(input));
  const provided = Buffer.from(input.signature);

  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function formDataToTwilioParameters(formData: FormData) {
  const parameters: TwilioWebhookParameters = {};

  for (const [key, rawValue] of formData.entries()) {
    const value = typeof rawValue === "string" ? rawValue : rawValue.name;
    const existing = parameters[key];

    if (typeof existing === "string") {
      parameters[key] = [existing, value];
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      parameters[key] = value;
    }
  }

  return parameters;
}

export function getTwilioParameter(
  parameters: TwilioWebhookParameters,
  key: string
) {
  const value = parameters[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export type SmsKeyword = "help" | "start" | "stop" | null;

export function classifySmsKeyword(body: string, optOutType?: string | null): SmsKeyword {
  const twilioType = optOutType?.trim().toUpperCase();

  if (twilioType === "STOP") return "stop";
  if (twilioType === "START") return "start";
  if (twilioType === "HELP") return "help";

  const normalized = body.trim().toUpperCase();

  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(normalized)) {
    return "stop";
  }

  if (["START", "UNSTOP", "YES"].includes(normalized)) {
    return "start";
  }

  if (["HELP", "INFO"].includes(normalized)) {
    return "help";
  }

  return null;
}

export function buildTimeCardConfirmationSmsBody(input: {
  companyName: string;
  reminder?: boolean;
  responseUrl: string;
}) {
  return [
    `${input.companyName} Time Card Manager: ${input.reminder ? "Reminder—please confirm your time." : "Please confirm your time."}`,
    "Reply A if you did not work, or B + 9am - 5pm if you worked.",
    `Secure form: ${input.responseUrl}`,
    "Reply STOP to opt out; HELP for help."
  ].join(" ");
}
