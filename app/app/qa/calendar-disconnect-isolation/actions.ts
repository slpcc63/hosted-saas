"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireCurrentCustomer } from "@/lib/customers";
import { runCalendarDisconnectIsolationProbe } from "@/lib/qa-calendar-disconnect-isolation";

export async function runCalendarDisconnectIsolationAction() {
  const requestHeaders = await headers();
  const hostname = (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    ""
  ).split(":")[0];
  const { customer } = await requireCurrentCustomer(
    "/qa/calendar-disconnect-isolation",
    "/time-card-manager"
  );
  const result = await runCalendarDisconnectIsolationProbe({
    customerEmail: customer.email,
    customerId: customer.id,
    hostname
  });

  console.info("[qa-calendar-disconnect-isolation]", result);
  redirect(
    `/qa/calendar-disconnect-isolation?result=passed&feeds=${result.enabledFeedCountTested}&feeds_restored=${result.enabledFeedCountRestored}`
  );
}
