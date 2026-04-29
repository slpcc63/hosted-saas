import { redirect } from "next/navigation";

import { requireCurrentCustomer } from "@/lib/customers";
import { getPublishedSubscriptionPlans } from "@/lib/products";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import { getStripeCheckoutSession, isStripeConfigured } from "@/lib/stripe";
import { upsertStripeSubscriptionForCustomer } from "@/lib/subscriptions";

type BillingSuccessPageProps = {
  searchParams?: Promise<{
    session_id?: string;
  }>;
};

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/subscriptions" : "/app/subscriptions";
  const { customer } = await requireCurrentCustomer(redirectTo, redirectTo);
  const params = await searchParams;
  const sessionId = String(params?.session_id ?? "").trim();

  if (!sessionId || !isStripeConfigured()) {
    redirect(`${redirectTo}?error=stripe_checkout_failed`);
  }

  await ensureSeedCatalog();

  const checkoutSession = await getStripeCheckoutSession(sessionId);
  const planId = checkoutSession.metadata?.planId;
  const stripeSubscriptionId = checkoutSession.subscription;

  if (!planId || !stripeSubscriptionId) {
    redirect(`${redirectTo}?error=stripe_checkout_failed`);
  }

  const plans = await getPublishedSubscriptionPlans();
  const plan = plans.find((entry) => entry.planId === planId);

  if (!plan) {
    redirect(`${redirectTo}?error=stripe_plan_missing`);
  }

  await upsertStripeSubscriptionForCustomer({
    customerId: customer.id,
    planId,
    stripeSubscriptionId
  });

  redirect(`${redirectTo}?saved=subscription`);
}
