"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import {
  rotateSquareCalendarSinkFeedToken,
  setSquareCalendarSinkEnabled,
  updateSquareCalendarSinkSettings
} from "@/lib/square-calendar-sink";

export async function saveSquareCalendarSinkSettingsAction(formData: FormData) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/calendar-sink" : "/app/calendar-sink";
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const calendarName = String(formData.get("calendarName") ?? "Work").trim();

  if (!teamMemberId) {
    redirect(`${redirectTo}?error=team_member_required`);
  }

  await updateSquareCalendarSinkSettings({
    customerId: customer.id,
    teamMemberId,
    calendarName
  });

  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=settings`);
}

export async function rotateSquareCalendarSinkFeedAction() {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/calendar-sink" : "/app/calendar-sink";
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");

  await rotateSquareCalendarSinkFeedToken(customer.id);
  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=feed_rotated`);
}

export async function setSquareCalendarSinkEnabledAction(formData: FormData) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/calendar-sink" : "/app/calendar-sink";
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  const enabled = String(formData.get("enabled") ?? "") === "true";

  await setSquareCalendarSinkEnabled(customer.id, enabled);
  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=${enabled ? "feed_enabled" : "feed_disabled"}`);
}
