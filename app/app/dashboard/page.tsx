import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/lib/auth/server";
import { isAdmin } from "@/lib/authorization";
import { getOrCreateCustomerProfile } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import {
  getTimeCardManagerOverview,
  getTimeCardManagerSquareStatus
} from "@/lib/square-time-card-manager";

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const routing = await getPublicRouting();
  const session = await requireSession(routing.dashboardPath);
  const customer = await getOrCreateCustomerProfile({
    userId: session.user.id,
    email: session.user.email,
    companyName: session.user.name ?? session.user.email.split("@")[0] ?? "",
    contactName: session.user.name ?? "",
    status: "active"
  });
  await ensureSeedCatalog();
  const admin = await isAdmin(session.user.id);
  const params = await searchParams;
  const displayName = customer.contactName ?? customer.companyName ?? session.user.email;
  const [timeCardOverview, squareStatus] = await Promise.all([
    getTimeCardManagerOverview(customer.id),
    getTimeCardManagerSquareStatus(customer.id)
  ]);
  const timeCardPath = routing.appHost ? "/time-card-manager" : "/app/time-card-manager";
  const subscriptionsPath = routing.appHost ? "/subscriptions" : "/app/subscriptions";
  const accountPath = routing.appHost ? "/account" : "/app/account";
  const hasSubscription = Boolean(timeCardOverview.entitlement);
  const hasPhone = Boolean(customer.phone?.trim());
  const squareReady = squareStatus.connected && squareStatus.missingScopes.length === 0;
  const scheduleReady = timeCardOverview.scheduleEntries.length > 0;

  const setupSteps = [
    {
      label: "Choose a Time Card Manager plan",
      done: hasSubscription,
      detail: hasSubscription
        ? timeCardOverview.entitlement?.packageName ?? "Active plan"
        : "Pick a subscription to unlock setup controls."
    },
    {
      label: "Connect Square",
      done: squareReady,
      detail: squareReady
        ? "Labor permissions are ready for live scans."
        : squareStatus.connected
          ? "Reconnect Square to add labor permissions."
          : "Connect Square before running live timecard scans."
    },
    {
      label: "Add a notification phone number",
      done: hasPhone,
      detail: hasPhone
        ? customer.phone ?? "Phone saved"
        : "Save a phone number if you want test texts or text delivery later."
    },
    {
      label: "Schedule your first automated run",
      done: scheduleReady,
      detail: scheduleReady
        ? timeCardOverview.nextRunLabel ?? "Automation schedule saved"
        : "Add at least one weekly run so automation knows when to scan."
    }
  ];

  const nextStep = !hasSubscription
    ? {
        title: "Choose your subscription",
        body: "Start with a Time Card Manager plan so the rest of the setup flow becomes available.",
        href: subscriptionsPath,
        label: "Choose a plan"
      }
    : !squareReady
      ? {
          title: "Connect Square",
          body: "Link your Square account so live missed clock-out detection can read labor data.",
          href: timeCardPath,
          label: "Open Time Card Manager"
        }
      : !hasPhone
        ? {
            title: "Add your contact phone",
            body: "Save the phone number you want to use for test texts and future text notifications.",
            href: accountPath,
            label: "Update account"
          }
        : !scheduleReady
          ? {
              title: "Set your automation schedule",
              body: "Choose when the Time Card Manager should automatically scan Square and send alerts.",
              href: timeCardPath,
              label: "Set schedule"
            }
          : {
              title: "Review notification settings",
              body: "Your core setup is in place. Fine-tune delivery mode, test notifications, and review recent activity.",
              href: timeCardPath,
              label: "Open Time Card Manager"
            };

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Customer Dashboard</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>{displayName} dashboard</h1>
            <p>
              Use this dashboard to see what is already configured and what
              should happen next.
            </p>
            {timeCardOverview.alertMessage ? (
              <div className="dashboard-alert warning">
                <strong>Time card texting paused</strong>
                <p>{timeCardOverview.alertMessage}</p>
                <a className="pill" href={subscriptionsPath}>
                  Manage subscription
                </a>
              </div>
            ) : null}
            {params?.saved === "square_connection" ? (
              <p className="form-success">Square connected successfully.</p>
            ) : null}
            {params?.error === "square_authorization_failed" ? (
              <p className="form-error">Square authorization was cancelled or failed before the callback completed.</p>
            ) : null}
            {params?.error === "square_token_exchange_failed" ? (
              <p className="form-error">Square returned a callback, but the token exchange failed.</p>
            ) : null}
            <div className="stat-row">
              <div className="stat">
                <strong>Account</strong>
                {customer.email}
              </div>
              <div className="stat">
                <strong>Subscriptions</strong>
                {timeCardOverview.entitlement ? timeCardOverview.entitlement.packageName : "No time card plan yet"}
              </div>
              <div className="stat">
                <strong>Billing</strong>
                {timeCardOverview.currentUsage
                  ? `${timeCardOverview.currentUsage.textsSentCount}/${timeCardOverview.entitlement?.monthlyTextLimit ?? 0} texts used`
                  : "No text usage yet"}
              </div>
            </div>
            <div className="metric">
              <strong>Next step</strong>
              {nextStep.title}
              <p>{nextStep.body}</p>
              <div className="subscription-actions">
                <a className="pill primary" href={nextStep.href}>
                  {nextStep.label}
                </a>
              </div>
            </div>
            <div className="stack-list">
              <article className="dashboard-subcard">
                <div className="subcard-header">
                  <div>
                    <h2>Square Time Card Manager</h2>
                    <p>
                      {timeCardOverview.entitlement
                        ? `Configured mode: ${timeCardOverview.settings.notificationMode.replaceAll("_", " ")}`
                        : "Subscribe first to unlock time card notification controls."}
                    </p>
                  </div>
                  <span className="status-chip">
                    {timeCardOverview.textingLive
                      ? timeCardOverview.delivery.effectiveMode.replaceAll("_", " ")
                      : "email live"}
                  </span>
                </div>
                {timeCardOverview.entitlement ? (
                  <>
                    <div className="stat-row compact">
                      <div className="stat">
                        <strong>Package</strong>
                        {timeCardOverview.entitlement.packageName}
                      </div>
                      <div className="stat">
                        <strong>Texts left</strong>
                        {timeCardOverview.delivery.textsRemaining}
                      </div>
                      <div className="stat">
                        <strong>Next run</strong>
                        {timeCardOverview.nextRunLabel
                          ? timeCardOverview.automationLive
                            ? timeCardOverview.nextRunLabel
                            : `${timeCardOverview.nextRunLabel} (cron setup needed)`
                          : timeCardOverview.automationLive
                            ? "Automation off"
                            : "Cron setup needed"}
                      </div>
                      <div className="stat">
                        <strong>Email sender</strong>
                        {timeCardOverview.senderProfile.fromEmail}
                      </div>
                    </div>
                    <div className="subscription-actions">
                      <a className="pill primary" href={timeCardPath}>
                        Open Time Card Manager
                      </a>
                      <a className="pill" href={subscriptionsPath}>
                        Manage subscription
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="subscription-actions">
                    <a className="pill primary" href={subscriptionsPath}>
                      Subscribe to Time Card Manager
                    </a>
                  </div>
                )}
              </article>
            </div>
          </section>

          <aside className="dashboard-card">
            <h2>Setup checklist</h2>
            <p>
              Work through these in order. The checklist makes it easier to see
              what is finished and what is still blocking live notification flow.
            </p>
            <div className="stack-list">
              {setupSteps.map((step) => (
                <article className="dashboard-subcard" key={step.label}>
                  <div className="subcard-header">
                    <div>
                      <h2>{step.label}</h2>
                      <p>{step.detail}</p>
                    </div>
                    <span className="status-chip">{step.done ? "done" : "next"}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="metric">
              <strong>Account profile</strong>
              Billing, Square access, sender details, and notification delivery all follow this signed-in customer account.
            </div>
            {admin ? (
              <div className="metric">
                <strong>Admin Access</strong>
                Your account can also open internal admin product tools.
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}
