import { SiteHeader } from "@/components/site-header";
import { requireSession } from "@/packages/identity/auth/server";
import { isAdmin } from "@/packages/identity/authorization";
import { getOrCreateCustomerProfile } from "@/packages/identity/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import type { DashboardAction } from "@/packages/runtime-kit/dashboard";
import { dashboardProviders } from "./providers";

function ActionLink({ action }: { action: DashboardAction }) {
  return (
    <a className={action.primary ? "pill primary" : "pill"} href={action.href}>
      {action.label}
    </a>
  );
}

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
  const appPath = (path: string) => (routing.appHost ? path : `/app${path}`);
  const summaries = await Promise.all(
    dashboardProviders.map((provider) => provider({ customerId: customer.id, appPath }))
  );

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
            {summaries.map((summary) =>
              summary.alert ? (
                <div className="dashboard-alert warning" key={`alert-${summary.extensionId}`}>
                  <strong>{summary.alert.title}</strong>
                  <p>{summary.alert.message}</p>
                  {summary.alert.action ? <ActionLink action={summary.alert.action} /> : null}
                </div>
              ) : null
            )}
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
              {summaries.flatMap((summary) =>
                (summary.headlineStats ?? []).map((stat) => (
                  <div className="stat" key={`${summary.extensionId}-${stat.label}`}>
                    <strong>{stat.label}</strong>
                    {stat.value}
                  </div>
                ))
              )}
            </div>
            <div className="metric">
              <strong>Customer Profile</strong>
              Your account profile is the source of truth for billing, Square
              access, and plugin settings.
            </div>
            <div className="stack-list">
              {summaries.map(({ extensionId, card }) => (
                <article className="dashboard-subcard" key={extensionId}>
                  <div className="subcard-header">
                    <div>
                      <h2>{card.title}</h2>
                      <p>{card.description}</p>
                    </div>
                    {card.statusLabel ? <span className="status-chip">{card.statusLabel}</span> : null}
                  </div>
                  {card.stats.length ? (
                    <div className="stat-row compact">
                      {card.stats.map((stat) => (
                        <div className="stat" key={stat.label}>
                          <strong>{stat.label}</strong>
                          {stat.value}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="subscription-actions">
                    {card.actions.map((action) => (
                      <ActionLink action={action} key={action.label} />
                    ))}
                  </div>
                </article>
              ))}
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
