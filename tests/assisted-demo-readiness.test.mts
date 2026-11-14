import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsSource = await readFile(
  new URL("../app/app/actions.ts", import.meta.url),
  "utf8"
);
const subscriptionsSource = await readFile(
  new URL("../app/app/subscriptions/page.tsx", import.meta.url),
  "utf8"
);
const billingSuccessSource = await readFile(
  new URL("../app/app/billing/success/page.tsx", import.meta.url),
  "utf8"
);
const homeSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("subscription checkout fails closed when Stripe is unavailable", () => {
  const unavailableGuard = actionsSource.indexOf("if (!isStripeConfigured())");
  const customerCreation = actionsSource.indexOf("getOrCreateCustomerProfile", unavailableGuard);

  assert.ok(unavailableGuard >= 0, "missing Stripe availability guard");
  assert.ok(customerCreation > unavailableGuard, "guard must run before customer mutation");
  assert.match(actionsSource, /redirect\(`\$\{redirectTo\}\?error=stripe_not_configured`\)/);
  assert.doesNotMatch(actionsSource, /createSubscriptionForCustomer/);
  assert.doesNotMatch(actionsSource, /changeSubscriptionPlanForCustomer/);
  assert.doesNotMatch(actionsSource, /cancelSubscriptionForCustomer/);
});

test("subscription UI disables checkout when hosted billing is unavailable", () => {
  assert.match(subscriptionsSource, /disabled=\{alreadySubscribed \|\| !stripeEnabled\}/);
  assert.match(subscriptionsSource, /No subscription was created\./);
  assert.match(subscriptionsSource, /Plans are visible for assisted demonstrations/);
});

test("checkout completion verifies payment and customer ownership", () => {
  assert.match(billingSuccessSource, /checkoutSession\.customer === customer\.stripeCustomerId/);
  assert.match(billingSuccessSource, /checkoutSession\.metadata\?\.customerId === customer\.id/);
  assert.match(billingSuccessSource, /checkoutSession\.status === "complete"/);
  assert.match(billingSuccessSource, /checkoutSession\.payment_status === "paid"/);
});

test("suite catalog labels Closing Checklist as a non-persistent prototype", () => {
  assert.match(homeSource, /Prototype · demo data resets/);
  assert.match(homeSource, /It does not save data or change Square\./);
  assert.match(homeSource, /https:\/\/closing-checklist-platform\.vercel\.app/);
});
