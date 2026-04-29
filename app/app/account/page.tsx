import { SiteHeader } from "@/components/site-header";
import { saveCustomerProfileAction } from "@/app/app/actions";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";

type AccountPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/account" : "/app/account";
  const { customer } = await requireCurrentCustomer(redirectTo, routing.dashboardPath);
  const params = await searchParams;

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Account Settings</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Profile and account details</h1>
            <p>
              This is the first editable customer settings screen tied to the
              new account model. It gives you a simple place to store the
              identity details that future billing, subscriptions, and support
              screens will reuse.
            </p>
            {params?.saved === "profile" ? (
              <p className="form-success">Profile saved successfully.</p>
            ) : null}
            <form action={saveCustomerProfileAction} className="auth-form">
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label>
                Company name
                <input defaultValue={customer.companyName ?? ""} name="companyName" type="text" />
              </label>
              <label>
                Contact name
                <input defaultValue={customer.contactName ?? ""} name="contactName" type="text" />
              </label>
              <label>
                Email
                <input defaultValue={customer.email} disabled type="email" />
              </label>
              <label>
                Phone
                <input defaultValue={customer.phone ?? ""} name="phone" type="tel" />
              </label>
              <button className="pill primary pill-button" type="submit">
                Save profile
              </button>
            </form>
          </section>

          <aside className="dashboard-card">
            <h2>Account status</h2>
            <div className="stat-row compact">
              <div className="stat">
                <strong>Status</strong>
                {customer.status}
              </div>
              <div className="stat">
                <strong>Customer ID</strong>
                {customer.id}
              </div>
            </div>
            <ul className="checklist compact-list">
              <li>Next step here: billing profile and payment methods.</li>
              <li>Later step: notification preferences and support settings.</li>
            </ul>
          </aside>
        </div>
      </main>
    </>
  );
}
