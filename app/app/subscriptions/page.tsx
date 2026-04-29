import { SiteHeader } from "@/components/site-header";
import {
  cancelSubscriptionAction,
  changeSubscriptionPlanAction,
  openBillingPortalAction,
  subscribeToPlanAction
} from "@/app/app/actions";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublishedSubscriptionPlans } from "@/lib/products";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import { isStripeConfigured } from "@/lib/stripe";
import { getSubscriptionsForCustomer } from "@/lib/subscriptions";

type SubscriptionsPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function SubscriptionsPage({ searchParams }: SubscriptionsPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/subscriptions" : "/app/subscriptions";
  const { customer } = await requireCurrentCustomer(
    redirectTo
  );
  await ensureSeedCatalog();
  const subscriptions = await getSubscriptionsForCustomer(customer.id);
  const availablePlans = await getPublishedSubscriptionPlans();
  const stripeEnabled = isStripeConfigured();
  const params = await searchParams;
  const activeProductIds = new Set(subscriptions.map((subscription) => subscription.productId));
  const timeCardManagerPath = routing.appHost ? "/time-card-manager" : "/app/time-card-manager";

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">My Subscriptions</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Active subscriptions</h1>
            <p>
              This screen shows the subscription records currently attached to
              your customer account.
            </p>
            {params?.saved === "subscription" ? (
              <p className="form-success">Subscription started successfully.</p>
            ) : null}
            {params?.saved === "plan_changed" ? (
              <p className="form-success">Subscription plan updated successfully.</p>
            ) : null}
            {params?.saved === "canceled" ? (
              <p className="form-success">Subscription canceled successfully.</p>
            ) : null}
            {params?.error === "plan_required" ? (
              <p className="form-error">Choose a plan before subscribing.</p>
            ) : null}
            {params?.error === "plan_change_invalid" ? (
              <p className="form-error">Choose a valid plan to update this subscription.</p>
            ) : null}
            {params?.error === "subscription_missing" ? (
              <p className="form-error">That subscription could not be found.</p>
            ) : null}
            {params?.error === "stripe_not_configured" ? (
              <p className="form-error">Stripe is not configured yet for hosted billing.</p>
            ) : null}
            {params?.error === "stripe_customer_missing" ? (
              <p className="form-error">Stripe customer setup is still missing for this account.</p>
            ) : null}
            {params?.error === "stripe_plan_missing" ? (
              <p className="form-error">That plan is missing its Stripe lookup key or live Stripe price.</p>
            ) : null}
            {params?.error === "stripe_checkout_failed" ? (
              <p className="form-error">Stripe checkout could not be completed. Please try again.</p>
            ) : null}
            {subscriptions.length === 0 ? (
              <div className="metric">
                <strong>No subscriptions yet</strong>
                Choose a plan below to start your first subscription.
              </div>
            ) : (
              <div className="stack-list">
                {subscriptions.map((subscription) => (
                  <article className="dashboard-subcard" key={subscription.id}>
                    <div className="subcard-header">
                      <div>
                        <h2>{subscription.productTitle}</h2>
                        <p>{subscription.planName ?? "Plan to be assigned"}</p>
                      </div>
                      <span className="status-chip">{subscription.status}</span>
                    </div>
                    <div className="stat-row compact">
                      <div className="stat">
                        <strong>Billing</strong>
                        {subscription.billingStatus}
                      </div>
                      <div className="stat">
                        <strong>Renewal</strong>
                        {subscription.renewalDate
                          ? subscription.renewalDate.toLocaleDateString()
                          : "Not scheduled"}
                      </div>
                      <div className="stat">
                        <strong>Auto renew</strong>
                        {subscription.autoRenew ? "Enabled" : "Off"}
                      </div>
                      {subscription.productSlug === "square-time-card-manager" ? (
                        <div className="stat">
                          <strong>Sender</strong>
                          {typeof subscription.customSettings.notificationSenderLocalPart === "string" &&
                          subscription.customSettings.notificationSenderLocalPart
                            ? `${subscription.customSettings.notificationSenderLocalPart}@slpcc63.com`
                            : "notifications@slpcc63.com"}
                        </div>
                      ) : null}
                    </div>
                    <div className="subscription-actions">
                      {subscription.productSlug === "square-time-card-manager" ? (
                        <a className="pill primary" href={timeCardManagerPath}>
                          Manage time card notifications
                        </a>
                      ) : null}
                      {availablePlans
                        .filter(
                          (plan) =>
                            plan.productId === subscription.productId &&
                            plan.planId !== subscription.planId
                        )
                        .map((plan) => (
                          <form action={changeSubscriptionPlanAction} className="inline-form" key={plan.planId}>
                            <input name="redirectTo" type="hidden" value={redirectTo} />
                            <input name="subscriptionId" type="hidden" value={subscription.id} />
                            <input name="planId" type="hidden" value={plan.planId} />
                            <button className="pill pill-button" type="submit">
                              Switch to {plan.planName}
                            </button>
                          </form>
                        ))}
                      {subscription.status !== "canceled" ? (
                        <form action={cancelSubscriptionAction} className="inline-form">
                          <input name="redirectTo" type="hidden" value={redirectTo} />
                          <input name="subscriptionId" type="hidden" value={subscription.id} />
                          <button className="pill pill-button" type="submit">
                            Cancel subscription
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}

            {stripeEnabled && subscriptions.length > 0 ? (
              <form action={openBillingPortalAction} className="inline-form">
                <input name="redirectTo" type="hidden" value={redirectTo} />
                <button className="pill primary pill-button" type="submit">
                  Manage billing in Stripe
                </button>
              </form>
            ) : null}

            <div className="stack-list">
              {availablePlans.map((plan) => {
                const alreadySubscribed = activeProductIds.has(plan.productId);

                return (
                  <article className="dashboard-subcard" key={plan.planId}>
                    <div className="subcard-header">
                      <div>
                        <h2>{plan.productTitle}</h2>
                        <p>{plan.planName}</p>
                      </div>
                      <span className="status-chip">
                        ${plan.price}/{plan.billingInterval}
                      </span>
                    </div>
                    <p>{plan.description ?? "Plan details coming soon."}</p>
                    {plan.productSlug === "square-time-card-manager" ? (
                      <p className="auth-helper">
                        {plan.textingEnabled
                          ? `Includes text notifications with a ${plan.monthlyTextLimit} text monthly limit.`
                          : "This package is currently positioned around the approved phase 1 scope."}
                      </p>
                    ) : null}
                    {plan.featuresIncluded.length ? (
                      <ul className="checklist compact-list">
                        {plan.featuresIncluded.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    ) : null}
                    <form action={subscribeToPlanAction} className="inline-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <input name="planId" type="hidden" value={plan.planId} />
                      <button
                        className="pill primary pill-button"
                        disabled={alreadySubscribed}
                        type="submit"
                      >
                        {alreadySubscribed ? "Already subscribed" : `Subscribe to ${plan.planName}`}
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="dashboard-card">
            <h2>Billing notes</h2>
            <ul className="checklist compact-list">
              <li>Only explicitly approved products should appear here.</li>
              <li>Backlog offerings stay unpublished until they are reviewed and approved.</li>
              <li>Billing setup can evolve without changing customer ownership.</li>
            </ul>
            <div className="metric">
              <strong>Customer</strong>
              {customer.email}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
