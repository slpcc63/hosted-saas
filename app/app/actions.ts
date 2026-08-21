"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/server";
import { requireAdmin } from "@/lib/authorization";
import {
  getCustomerByUserId,
  getOrCreateCustomerProfile,
  setStripeCustomerId,
  upsertCustomerProfile
} from "@/lib/customers";
import { createProduct, getPublishedSubscriptionPlans } from "@/lib/products";
import {
  createStripeBillingPortalSession,
  createStripeCheckoutSession,
  createStripeCustomer,
  isStripeConfigured
} from "@/lib/stripe";
import {
  cancelSubscriptionForCustomer,
  changeSubscriptionPlanForCustomer,
  createSubscriptionForCustomer
} from "@/lib/subscriptions";
import { parseManagedSenderLocalPart } from "@/lib/email";
import {
  addTimeCardManagerScheduleEntry,
  findMissedClockOutCandidatesForCustomer,
  isTimeCardManagerAutomationLive,
  isTimeCardManagerTextingLive,
  normalizeNotificationMode,
  removeTimeCardManagerScheduleEntry,
  sendTimeCardManagerMissedClockOutEmail,
  sendTimeCardManagerTestEmail,
  upsertTimeCardManagerSettings
} from "@/lib/square-time-card-manager";
import {
  getActiveSubscriptionForProduct,
  updateSubscriptionCustomSettings
} from "@/lib/subscriptions";
import {
  createAndSendTimeCardConfirmationRequest,
  resendTimeCardConfirmationRequest,
  reviewTimeCardConfirmationRequest,
  submitTimeCardEmployeeResponse,
  syncTimeCardEmployeesFromSquare,
  updateTimeCardEmployeeContact,
  upsertTimeCardConfirmationSettings
} from "@/lib/time-card-email-workflow";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function getTimeCardWorkflowRedirect(value: FormDataEntryValue | null) {
  const candidate = String(value ?? "");

  if (
    candidate === "/time-card-manager/responses" ||
    candidate === "/app/time-card-manager/responses"
  ) {
    return candidate;
  }

  return "/app/time-card-manager/responses";
}

export async function createProductAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/products");
  await requireAdmin(redirectTo, "/dashboard");

  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "square_plugin";
  const platform = String(formData.get("platform") ?? "").trim();
  const shortDescription = String(formData.get("shortDescription") ?? "").trim();
  const pricingModel = String(formData.get("pricingModel") ?? "").trim() || "subscription";
  const status = String(formData.get("status") ?? "").trim() || "draft";
  const published = String(formData.get("published") ?? "") === "on";

  if (!title) {
    redirect(`${redirectTo}?error=product_title_required`);
  }

  await createProduct({
    title,
    slug: slugify(title) || "product",
    category,
    platform,
    shortDescription,
    pricingModel,
    published,
    status
  });

  revalidatePath("/app/admin/products");
  redirect(`${redirectTo}?saved=product`);
}

export async function saveCustomerProfileAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/account");
  const session = await requireSession(redirectTo);
  const email = session.user.email;
  const companyName = String(formData.get("companyName") ?? "").trim();
  const contactName = String(formData.get("contactName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  await getOrCreateCustomerProfile({
    userId: session.user.id,
    email,
    companyName,
    contactName,
    phone,
    status: "active"
  });

  await upsertCustomerProfile({
    userId: session.user.id,
    email,
    companyName,
    contactName,
    phone,
    status: "active"
  });

  revalidatePath("/app/account");
  revalidatePath("/app/dashboard");
  redirect(`${redirectTo}?saved=profile`);
}

export async function subscribeToPlanAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/subscriptions");
  const session = await requireSession(redirectTo);
  const planId = String(formData.get("planId") ?? "").trim();

  if (!planId) {
    redirect(`${redirectTo}?error=plan_required`);
  }

  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  if (isStripeConfigured()) {
    const plans = await getPublishedSubscriptionPlans();
    const plan = plans.find((entry) => entry.planId === planId);

    if (!plan?.stripePriceLookupKey) {
      redirect(`${redirectTo}?error=stripe_plan_missing`);
    }

    let stripeCustomerId = customer.stripeCustomerId;

    if (!stripeCustomerId) {
      const stripeCustomer = await createStripeCustomer({
        email: customer.email,
        name: customer.contactName ?? customer.companyName
      });

      stripeCustomerId = stripeCustomer.id;
      await setStripeCustomerId(customer.id, stripeCustomerId);
    }

    const successPath = `/billing/success?session_id={CHECKOUT_SESSION_ID}`;
    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000"}${successPath}`;
    const cancelUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://app.localhost:3000"}${redirectTo}`;

    const checkoutSession = await createStripeCheckoutSession({
      cancelUrl,
      customerId: stripeCustomerId,
      localCustomerId: customer.id,
      lookupKey: plan.stripePriceLookupKey,
      planId,
      successUrl
    });

    if (!checkoutSession.url) {
      redirect(`${redirectTo}?error=stripe_checkout_failed`);
    }

    redirect(checkoutSession.url);
  }

  await createSubscriptionForCustomer({
    customerId: customer.id,
    planId
  });

  revalidatePath("/app/subscriptions");
  revalidatePath("/app/dashboard");
  redirect(`${redirectTo}?saved=subscription`);
}

export async function openBillingPortalAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/subscriptions");
  const session = await requireSession(redirectTo);

  if (!isStripeConfigured()) {
    redirect(`${redirectTo}?error=stripe_not_configured`);
  }

  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  if (!customer.stripeCustomerId) {
    redirect(`${redirectTo}?error=stripe_customer_missing`);
  }

  const portalSession = await createStripeBillingPortalSession({
    customerId: customer.stripeCustomerId,
    returnPath: redirectTo
  });

  redirect(portalSession.url);
}

export async function changeSubscriptionPlanAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/subscriptions");
  const session = await requireSession(redirectTo);
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();

  if (!subscriptionId || !planId) {
    redirect(`${redirectTo}?error=plan_change_invalid`);
  }

  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  await changeSubscriptionPlanForCustomer({
    customerId: customer.id,
    planId,
    subscriptionId
  });

  revalidatePath("/app/subscriptions");
  revalidatePath("/app/dashboard");
  redirect(`${redirectTo}?saved=plan_changed`);
}

export async function cancelSubscriptionAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/subscriptions");
  const session = await requireSession(redirectTo);
  const subscriptionId = String(formData.get("subscriptionId") ?? "").trim();

  if (!subscriptionId) {
    redirect(`${redirectTo}?error=subscription_missing`);
  }

  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });

  await cancelSubscriptionForCustomer({
    customerId: customer.id,
    subscriptionId
  });

  revalidatePath("/app/subscriptions");
  revalidatePath("/app/dashboard");
  redirect(`${redirectTo}?saved=canceled`);
}

export async function saveTimeCardManagerSettingsAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const notificationMode = normalizeNotificationMode(
    String(formData.get("notificationMode") ?? "").trim()
  );
  const textingLive = isTimeCardManagerTextingLive();
  const automationLive = isTimeCardManagerAutomationLive();
  const effectiveNotificationMode =
    !textingLive && notificationMode !== "email_only"
      ? "email_only"
      : notificationMode;
  const automationEnabled =
    automationLive && String(formData.get("automationEnabled") ?? "") === "on";

  await upsertTimeCardManagerSettings({
    customerId: customer.id,
    notificationMode: effectiveNotificationMode,
    automationEnabled
  });

  revalidatePath("/app/time-card-manager");
  revalidatePath("/app/dashboard");
  const saveState =
    !textingLive && notificationMode !== "email_only"
      ? "settings_sms_pending"
      : !automationLive
        ? "settings_manual_only"
        : "settings";
  redirect(`${redirectTo}?saved=${saveState}`);
}

export async function addTimeCardManagerScheduleEntryAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const dayOfWeek = Number(formData.get("dayOfWeek"));
  const runTimeLocal = String(formData.get("runTimeLocal") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/Los_Angeles";

  if (
    Number.isNaN(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !/^\d{2}:\d{2}$/.test(runTimeLocal)
  ) {
    redirect(`${redirectTo}?error=schedule_invalid`);
  }

  await addTimeCardManagerScheduleEntry({
    customerId: customer.id,
    dayOfWeek,
    runTimeLocal,
    timezone
  });

  revalidatePath("/app/time-card-manager");
  redirect(`${redirectTo}?saved=schedule`);
}

export async function saveTimeCardManagerSenderAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const subscription = await getActiveSubscriptionForProduct({
    customerId: customer.id,
    productSlug: "square-time-card-manager"
  });

  if (!subscription) {
    redirect(`${redirectTo}?error=sender_subscription_missing`);
  }

  const senderLocalPart = String(formData.get("senderLocalPart") ?? "");
  const parsedSenderLocalPart = parseManagedSenderLocalPart(senderLocalPart);

  if (senderLocalPart.trim() && parsedSenderLocalPart.error) {
    redirect(`${redirectTo}?error=sender_invalid`);
  }

  await updateSubscriptionCustomSettings({
    customerId: customer.id,
    subscriptionId: subscription.id,
    customSettings: {
      notificationSenderLocalPart: parsedSenderLocalPart.normalized
    }
  });

  revalidatePath("/app/time-card-manager");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/subscriptions");
  redirect(`${redirectTo}?saved=sender`);
}

export async function sendTimeCardManagerTestEmailAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  try {
    await sendTimeCardManagerTestEmail({ customer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send test email";

    if (message.includes("subscription")) {
      redirect(`${redirectTo}?error=test_email_subscription_missing`);
    }

    if (message.includes("current notification mode")) {
      redirect(`${redirectTo}?error=test_email_delivery_disabled`);
    }

    redirect(`${redirectTo}?error=test_email_failed`);
  }

  revalidatePath("/app/time-card-manager");
  redirect(`${redirectTo}?saved=test_email`);
}

export async function sendTimeCardManagerMissedClockOutEmailAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const employeeName = String(formData.get("employeeName") ?? "").trim();
  const shiftDate = String(formData.get("shiftDate") ?? "").trim();
  const clockInTime = String(formData.get("clockInTime") ?? "").trim();
  const expectedClockOutTime = String(formData.get("expectedClockOutTime") ?? "").trim();
  const locationName = String(formData.get("locationName") ?? "").trim();

  if (!employeeName || !shiftDate || !clockInTime) {
    redirect(`${redirectTo}?error=missed_clock_out_invalid`);
  }

  try {
    await sendTimeCardManagerMissedClockOutEmail({
      customer,
      employeeName,
      shiftDate,
      clockInTime,
      expectedClockOutTime,
      locationName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send missed clock-out alert";

    if (message.includes("subscription")) {
      redirect(`${redirectTo}?error=missed_clock_out_subscription_missing`);
    }

    if (message.includes("current notification mode")) {
      redirect(`${redirectTo}?error=missed_clock_out_delivery_disabled`);
    }

    redirect(`${redirectTo}?error=missed_clock_out_failed`);
  }

  revalidatePath("/app/time-card-manager");
  redirect(`${redirectTo}?saved=missed_clock_out`);
}

export async function scanSquareMissedClockOutsAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const thresholdHours = Number(formData.get("thresholdHours") ?? 12);

  if (Number.isNaN(thresholdHours) || thresholdHours < 1 || thresholdHours > 24) {
    redirect(`${redirectTo}?error=square_scan_invalid`);
  }

  let candidates;

  try {
    candidates = await findMissedClockOutCandidatesForCustomer({
      customerId: customer.id,
      thresholdHours
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to scan Square timecards";

    if (message.includes("not connected")) {
      redirect(`${redirectTo}?error=square_scan_not_connected`);
    }

    if (message.includes("missing labor scopes")) {
      redirect(`${redirectTo}?error=square_scan_missing_scopes`);
    }

    redirect(`${redirectTo}?error=square_scan_failed`);
  }

  if (!candidates.length) {
    redirect(`${redirectTo}?saved=square_scan_none`);
  }

  try {
    for (const candidate of candidates) {
      await sendTimeCardManagerMissedClockOutEmail({
        customer,
        employeeName: candidate.teamMemberName,
        shiftDate: candidate.shiftDateLabel,
        clockInTime: candidate.clockInTimeLabel,
        locationName: candidate.locationName ?? undefined
      });
    }
  } catch {
    redirect(`${redirectTo}?error=square_scan_send_failed`);
  }

  revalidatePath("/app/time-card-manager");
  redirect(`${redirectTo}?saved=square_scan_sent&count=${encodeURIComponent(String(candidates.length))}`);
}

export async function removeTimeCardManagerScheduleEntryAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/time-card-manager");
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const scheduleEntryId = String(formData.get("scheduleEntryId") ?? "").trim();

  if (!scheduleEntryId) {
    redirect(`${redirectTo}?error=schedule_invalid`);
  }

  await removeTimeCardManagerScheduleEntry({
    customerId: customer.id,
    scheduleEntryId
  });

  revalidatePath("/app/time-card-manager");
  redirect(`${redirectTo}?saved=schedule_removed`);
}

export async function syncTimeCardEmployeesAction(formData: FormData) {
  const redirectTo = getTimeCardWorkflowRedirect(formData.get("redirectTo"));
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  let count = 0;
  let errorCode: string | null = null;

  try {
    count = await syncTimeCardEmployeesFromSquare(customer.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sync employees";
    errorCode = message.includes("not connected")
      ? "employee_sync_not_connected"
      : message.includes("employee read access")
        ? "employee_sync_missing_scope"
        : "employee_sync_failed";
  }

  if (errorCode) {
    redirect(`${redirectTo}?error=${errorCode}`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${redirectTo}?saved=employees_synced&count=${encodeURIComponent(String(count))}`);
}

export async function saveTimeCardEmployeeContactAction(formData: FormData) {
  const redirectTo = getTimeCardWorkflowRedirect(formData.get("redirectTo"));
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  let failed = false;

  try {
    await updateTimeCardEmployeeContact({
      customerId: customer.id,
      employeeId,
      email,
      timezone
    });
  } catch {
    failed = true;
  }

  if (failed) {
    redirect(`${redirectTo}?error=employee_contact_invalid`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${redirectTo}?saved=employee_contact`);
}

export async function saveTimeCardConfirmationSettingsAction(formData: FormData) {
  const redirectTo = getTimeCardWorkflowRedirect(formData.get("redirectTo"));
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const subscription = await getActiveSubscriptionForProduct({
    customerId: customer.id,
    productSlug: "square-time-card-manager"
  });

  if (!subscription) {
    redirect(`${redirectTo}?error=confirmation_subscription_missing`);
  }

  let failed = false;

  try {
    await upsertTimeCardConfirmationSettings({
      customerId: customer.id,
      automationEnabled: String(formData.get("automationEnabled") ?? "") === "on",
      managerReminderEnabled: String(formData.get("managerReminderEnabled") ?? "") === "on",
      managerReminderTimeLocal: String(formData.get("managerReminderTimeLocal") ?? ""),
      sendDayOfWeek: Number(formData.get("sendDayOfWeek")),
      sendTimeLocal: String(formData.get("sendTimeLocal") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
      periodDays: Number(formData.get("periodDays"))
    });
  } catch {
    failed = true;
  }

  if (failed) {
    redirect(`${redirectTo}?error=confirmation_settings_invalid`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${redirectTo}?saved=confirmation_settings`);
}

export async function sendTimeCardConfirmationRequestAction(formData: FormData) {
  const redirectTo = getTimeCardWorkflowRedirect(formData.get("redirectTo"));
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const subscription = await getActiveSubscriptionForProduct({
    customerId: customer.id,
    productSlug: "square-time-card-manager"
  });

  if (!subscription) {
    redirect(`${redirectTo}?error=confirmation_subscription_missing`);
  }

  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  let errorCode: string | null = null;

  try {
    await createAndSendTimeCardConfirmationRequest({
      customerId: customer.id,
      employeeId,
      periodStart,
      periodEnd
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to send request";
    errorCode = message.includes("valid email")
      ? "confirmation_employee_email_missing"
      : message.includes("already exists")
        ? "confirmation_duplicate"
      : message.includes("period")
        ? "confirmation_period_invalid"
        : "confirmation_send_failed";
  }

  if (errorCode) {
    redirect(`${redirectTo}?error=${errorCode}`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${redirectTo}?saved=confirmation_sent`);
}

export async function resendTimeCardConfirmationRequestAction(formData: FormData) {
  const redirectTo = getTimeCardWorkflowRedirect(formData.get("redirectTo"));
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const subscription = await getActiveSubscriptionForProduct({
    customerId: customer.id,
    productSlug: "square-time-card-manager"
  });

  if (!subscription) {
    redirect(`${redirectTo}?error=confirmation_subscription_missing`);
  }

  let failed = false;

  try {
    await resendTimeCardConfirmationRequest({
      actorIdentifier: session.user.id,
      customerId: customer.id,
      requestId: String(formData.get("requestId") ?? "").trim()
    });
  } catch {
    failed = true;
  }

  if (failed) {
    redirect(`${redirectTo}?error=confirmation_resend_failed`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${redirectTo}?saved=confirmation_resent`);
}

export async function submitTimeCardEmployeeResponseAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const responsePath = `/app/time-card-response/${encodeURIComponent(token)}`;
  let errorCode: string | null = null;

  try {
    await submitTimeCardEmployeeResponse({
      token,
      responseCode: String(formData.get("responseCode") ?? ""),
      shiftDate: String(formData.get("shiftDate") ?? ""),
      timeIn: String(formData.get("timeIn") ?? ""),
      timeOut: String(formData.get("timeOut") ?? ""),
      responseNote: String(formData.get("responseNote") ?? "")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit response";
    errorCode = message.includes("expired")
      ? "response_expired"
      : message.includes("already") || message.includes("no longer")
        ? "response_already_submitted"
        : message.includes("invalid")
          ? "response_invalid"
          : "response_validation";
  }

  if (errorCode) {
    redirect(`${responsePath}?error=${errorCode}`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${responsePath}?saved=response`);
}

export async function reviewTimeCardConfirmationRequestAction(formData: FormData) {
  const redirectTo = getTimeCardWorkflowRedirect(formData.get("redirectTo"));
  const session = await requireSession(redirectTo);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect("/app");
  }

  const decision = String(formData.get("decision") ?? "");

  if (decision !== "approved" && decision !== "rejected") {
    redirect(`${redirectTo}?error=review_invalid`);
  }

  let failed = false;

  try {
    await reviewTimeCardConfirmationRequest({
      customerId: customer.id,
      reviewerUserId: session.user.id,
      requestId: String(formData.get("requestId") ?? ""),
      decision,
      shiftDate: String(formData.get("shiftDate") ?? ""),
      timeIn: String(formData.get("timeIn") ?? ""),
      timeOut: String(formData.get("timeOut") ?? ""),
      managerNote: String(formData.get("managerNote") ?? "")
    });
  } catch {
    failed = true;
  }

  if (failed) {
    redirect(`${redirectTo}?error=review_invalid`);
  }

  revalidatePath("/app/time-card-manager/responses");
  redirect(`${redirectTo}?saved=${decision}`);
}
