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

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
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
  const automationEnabled = String(formData.get("automationEnabled") ?? "") === "on";

  await upsertTimeCardManagerSettings({
    customerId: customer.id,
    notificationMode,
    automationEnabled
  });

  revalidatePath("/app/time-card-manager");
  revalidatePath("/app/dashboard");
  redirect(`${redirectTo}?saved=settings`);
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
