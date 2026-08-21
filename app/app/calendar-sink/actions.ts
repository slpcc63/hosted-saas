"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireCurrentCustomer } from "@/lib/customers";
import { getAppOrigin } from "@/lib/deployment";
import { getPublicRouting } from "@/lib/request-routing";
import {
  distributeSquareCalendarSinkFeeds,
  type CalendarSinkDistributionMode
} from "@/lib/square-calendar-sink-delivery";
import {
  createMissingSquareCalendarSinkEmployeeFeeds,
  deleteSquareCalendarSinkEmployeeFeed,
  rotateSquareCalendarSinkFeedToken,
  setSquareCalendarSinkEnabled,
  upsertSquareCalendarSinkEmployeeFeed
} from "@/lib/square-calendar-sink";

async function getCalendarSinkActionContext() {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/calendar-sink" : "/app/calendar-sink";
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  const setupBaseUrl = `${getAppOrigin()}${routing.appHost ? "" : "/app"}/calendar-sink/subscribe`;
  return { customer, redirectTo, setupBaseUrl };
}

function getDistributionMode(formData: FormData): CalendarSinkDistributionMode {
  return String(formData.get("distributionMode") ?? "manual") === "email"
    ? "email"
    : "manual";
}

function buildDistributionSearchParams(
  saved: "bulk_created" | "feed_created",
  result: Awaited<ReturnType<typeof distributeSquareCalendarSinkFeeds>>
) {
  return new URLSearchParams({
    saved,
    created: String(result.createdCount),
    sent: String(result.sentCount),
    manual: String(result.manualCount),
    missing: String(result.missingContactCount),
    failed: String(result.failedCount)
  });
}

export async function createSquareCalendarSinkFeedAction(formData: FormData) {
  const { customer, redirectTo, setupBaseUrl } = await getCalendarSinkActionContext();
  const teamMemberId = String(formData.get("teamMemberId") ?? "").trim();
  const distributionMode = getDistributionMode(formData);

  if (!teamMemberId) {
    redirect(`${redirectTo}?error=team_member_required`);
  }

  const created = await upsertSquareCalendarSinkEmployeeFeed({
    customerId: customer.id,
    teamMemberId
  });
  const distribution = await distributeSquareCalendarSinkFeeds({
    created: [created],
    customer,
    mode: distributionMode,
    setupBaseUrl
  });

  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?${buildDistributionSearchParams("feed_created", distribution)}`);
}

export async function createMissingSquareCalendarSinkFeedsAction(formData: FormData) {
  const { customer, redirectTo, setupBaseUrl } = await getCalendarSinkActionContext();
  const distributionMode = getDistributionMode(formData);
  const created = await createMissingSquareCalendarSinkEmployeeFeeds(customer.id);

  if (!created.length) {
    redirect(`${redirectTo}?saved=bulk_none`);
  }

  const distribution = await distributeSquareCalendarSinkFeeds({
    created,
    customer,
    mode: distributionMode,
    setupBaseUrl
  });

  revalidatePath("/app/calendar-sink");
  redirect(`${redirectTo}?${buildDistributionSearchParams("bulk_created", distribution)}`);
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
