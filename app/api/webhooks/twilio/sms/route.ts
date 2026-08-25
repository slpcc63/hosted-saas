import type { NextRequest } from "next/server";

import { processInboundTimeCardSms } from "@/lib/time-card-email-workflow";
import { getTwilioAuthToken } from "@/lib/twilio";
import {
  formDataToTwilioParameters,
  getTwilioParameter,
  validateTwilioSignature
} from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

function twiml(message?: string) {
  const escaped = message
    ?.replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
  const body = escaped ? `<Message>${escaped}</Message>` : "";

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" }
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const parameters = formDataToTwilioParameters(formData);
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!validateTwilioSignature({
    authToken: getTwilioAuthToken(),
    parameters,
    signature,
    url: request.url
  })) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  const result = await processInboundTimeCardSms({
    body: getTwilioParameter(parameters, "Body"),
    from: getTwilioParameter(parameters, "From"),
    messageSid: getTwilioParameter(parameters, "MessageSid"),
    optOutType: getTwilioParameter(parameters, "OptOutType"),
    to: getTwilioParameter(parameters, "To")
  });

  if (result.kind === "stop" || result.kind === "start" || result.kind === "help") {
    return twiml();
  }

  if (result.kind === "accepted") {
    return twiml("SLPCC63 Time Card Manager: Response received. Your manager will review it.");
  }

  if (result.kind === "no_open_request") {
    return twiml("SLPCC63 Time Card Manager: No open time confirmation was found for this number.");
  }

  if (result.kind === "not_opted_in") {
    return twiml("SLPCC63 Time Card Manager: This number is not opted in. Use your secure email link to enroll.");
  }

  if (result.kind === "duplicate") {
    return twiml();
  }

  return twiml("SLPCC63 Time Card Manager: Reply A if you did not work, or B + 9am - 5pm if you worked. Reply STOP to opt out.");
}

