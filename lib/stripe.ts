import "server-only";

import { getAppOrigin } from "@/lib/deployment";

export type StripeCheckoutSession = {
  customer: string | null;
  id: string;
  subscription: string | null;
  url: string | null;
};

type StripeCustomer = {
  id: string;
};

type StripePrice = {
  id: string;
  lookup_key: string | null;
};

const stripeApiBase = "https://api.stripe.com/v1";

function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY ?? "";
}

export function isStripeConfigured() {
  return Boolean(getStripeSecretKey());
}

async function stripeRequest<T>(path: string, init?: RequestInit) {
  const secretKey = getStripeSecretKey();

  if (!secretKey) {
    throw new Error("Stripe is not configured");
  }

  const response = await fetch(`${stripeApiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Stripe request failed: ${message}`);
  }

  return response.json() as Promise<T>;
}

export async function getStripePriceByLookupKey(lookupKey: string) {
  const params = new URLSearchParams();
  params.append("lookup_keys[]", lookupKey);
  params.append("active", "true");

  const result = await stripeRequest<{ data: StripePrice[] }>(
    `/prices?${params.toString()}`,
    { method: "GET", headers: {} }
  );

  return result.data[0] ?? null;
}

export async function createStripeCustomer(input: {
  email: string;
  name?: string | null;
}) {
  const params = new URLSearchParams();
  params.append("email", input.email);

  if (input.name) {
    params.append("name", input.name);
  }

  return stripeRequest<StripeCustomer>("/customers", {
    body: params.toString(),
    method: "POST"
  });
}

export async function createStripeCheckoutSession(input: {
  cancelUrl: string;
  customerId: string;
  lookupKey: string;
  localCustomerId: string;
  planId: string;
  successUrl: string;
}) {
  const price = await getStripePriceByLookupKey(input.lookupKey);

  if (!price) {
    throw new Error(`Stripe price not found for lookup key: ${input.lookupKey}`);
  }

  const params = new URLSearchParams();
  params.append("mode", "subscription");
  params.append("customer", input.customerId);
  params.append("line_items[0][price]", price.id);
  params.append("line_items[0][quantity]", "1");
  params.append("success_url", input.successUrl);
  params.append("cancel_url", input.cancelUrl);
  params.append("client_reference_id", input.localCustomerId);
  params.append("metadata[customerId]", input.localCustomerId);
  params.append("metadata[planId]", input.planId);

  return stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
    body: params.toString(),
    method: "POST"
  });
}

export async function createStripeBillingPortalSession(input: {
  customerId: string;
  returnPath?: string;
}) {
  const params = new URLSearchParams();
  params.append("customer", input.customerId);
  params.append("return_url", `${getAppOrigin()}${input.returnPath ?? "/subscriptions"}`);

  return stripeRequest<{ url: string }>("/billing_portal/sessions", {
    body: params.toString(),
    method: "POST"
  });
}

export async function getStripeCheckoutSession(sessionId: string) {
  return stripeRequest<StripeCheckoutSession & { metadata?: Record<string, string> }>(
    `/checkout/sessions/${sessionId}`,
    { method: "GET", headers: {} }
  );
}
