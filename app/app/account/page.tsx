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
            <h1>Account details</h1>
            <p>
              Keep your company, contact, and phone details current so billing,
              notifications, and support all use the right information.
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
              <p className="auth-helper">
                This phone number is used for Time Card Manager text notifications and test
                texts when SMS is enabled in your package.
              </p>
              <button className="pill primary pill-button" type="submit">
                Save profile
              </button>
            </form>
          </section>

          <aside className="dashboard-card">
            <h2>How this is used</h2>
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
              <li>Your email is the default destination for live notification emails.</li>
              <li>Your phone number is used for test texts and text notifications.</li>
            </ul>
          </aside>
        </div>
      </main>
    </>
  );
}
