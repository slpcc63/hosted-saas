"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import {
  deleteSquareCalendarSinkEmployeeFeed,
  rotateSquareCalendarSinkFeedToken,
  setSquareCalendarSinkEnabled,
  upsertSquareCalendarSinkEmployeeFeed
} from "@/lib/square-calendar-sink";

async function getCalendarSinkActionContext() {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/calendar-sink" : "/app/calendar-sink";
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  return { customer, redirectTo };
}

export async function createSquareCalendarSinkFeedAction(formData: FormData) {
  const { customer, redirectTo } = await getCalendarSinkActionContext();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();

  if (!teamMemberId) {
    redirect(`${redirectTo}?error=team_member_required`);
  }

  await upsertSquareCalendarSinkEmployeeFeed({
    customerId: customer.id,
    teamMemberId
  });

  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=feed_created`);
}

export async function rotateSquareCalendarSinkFeedAction(formData: FormData) {
  const { customer, redirectTo } = await getCalendarSinkActionContext();
  const feedId = String(formData.get("feedId") ?? "").trim();

  if (!feedId) {
    redirect(`${redirectTo}?error=feed_required`);
  }

  await rotateSquareCalendarSinkFeedToken(customer.id, feedId);
  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=feed_rotated`);
}

export async function setSquareCalendarSinkEnabledAction(formData: FormData) {
  const { customer, redirectTo } = await getCalendarSinkActionContext();
  const feedId = String(formData.get("feedId") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";

  if (!feedId) {
    redirect(`${redirectTo}?error=feed_required`);
  }

  await setSquareCalendarSinkEnabled(customer.id, feedId, enabled);
  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=${enabled ? "feed_enabled" : "feed_disabled"}`);
}

export async function deleteSquareCalendarSinkFeedAction(formData: FormData) {
  const { customer, redirectTo } = await getCalendarSinkActionContext();
  const feedId = String(formData.get("feedId") ?? "").trim();

  if (!feedId) {
    redirect(`${redirectTo}?error=feed_required`);
  }

  await deleteSquareCalendarSinkEmployeeFeed(customer.id, feedId);
  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?saved=feed_deleted`);
}
