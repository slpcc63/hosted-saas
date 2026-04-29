import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/lib/auth/server";
import { isAdmin } from "@/lib/authorization";
import { getOrCreateCustomerProfile } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import { getTimeCardManagerOverview } from "@/lib/square-time-card-manager";

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
  const timeCardOverview = await getTimeCardManagerOverview(customer.id);
  const timeCardPath = routing.appHost ? "/time-card-manager" : "/app/time-card-manager";
  const subscriptionsPath = routing.appHost ? "/subscriptions" : "/app/subscriptions";

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Customer Dashboard</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>{displayName} dashboard</h1>
            <p>
              This dashboard is tied to your customer account, subscription
              status, and current Time Card Manager setup.
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
              <strong>Customer Profile</strong>
              Your account profile is the source of truth for billing, Square
              access, and plugin settings.
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
                    {timeCardOverview.delivery.effectiveMode.replaceAll("_", " ")}
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
                        {timeCardOverview.nextRunLabel ?? "Automation off"}
                      </div>
                      <div className="stat">
                        <strong>Email sender</strong>
                        {timeCardOverview.senderProfile.fromEmail}
                      </div>
                    </div>
                    <div className="subscription-actions">
                      <a className="pill primary" href={timeCardPath}>
                        Manage time card settings
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
            <h2>Current focus</h2>
            <p>
              The current product work is focused on the Square Time Card
              Manager. Anything not explicitly approved stays out of the
              customer-facing offering until it is planned.
            </p>
            <ul className="checklist compact-list">
              <li>Customer settings are tied to the signed-in account.</li>
              <li>Subscription details stay connected to the customer profile.</li>
              <li>Square connection work is being aligned to the same ownership model.</li>
            </ul>
            <div className="metric">
              <strong>Customer ID</strong>
              {customer.id}
            </div>
            {admin ? (
              <div className="metric">
                <strong>Admin Access</strong>
                Your account can open internal admin product tools.
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}
