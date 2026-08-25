import type { NextRequest } from "next/server";

import { updateTimeCardSmsDeliveryStatus } from "@/lib/time-card-email-workflow";
import { getTwilioAuthToken } from "@/lib/twilio";
import {
  formDataToTwilioParameters,
  getTwilioParameter,
  validateTwilioSignature
} from "@/lib/twilio-webhook";

export const dynamic = "force-dynamic";

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

  await updateTimeCardSmsDeliveryStatus({
    errorCode: getTwilioParameter(parameters, "ErrorCode"),
    errorMessage: getTwilioParameter(parameters, "ErrorMessage"),
    messageSid: getTwilioParameter(parameters, "MessageSid"),
    status: getTwilioParameter(parameters, "MessageStatus")
  });

  return new Response(null, { status: 204 });
}

