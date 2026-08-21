import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth/auth-form";
import { SiteHeader } from "@/components/site-header";
import { isPreviewDeployment } from "@/lib/deployment";
import { getPublicRouting } from "@/lib/request-routing";
import { getServerSession } from "@/lib/auth/server";

type SignInPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getServerSession();
  const routing = await getPublicRouting();
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  ) && !isPreviewDeployment();

  if (session?.user) {
    redirect(routing.dashboardPath);
  }

  const params = await searchParams;
  const nextPath = params?.next?.startsWith("/") ? params.next : routing.dashboardPath;
  const heading = nextPath === routing.dashboardPath ? "Sign in to your customer account" : "Continue to your workspace";
  const intro =
    nextPath === routing.dashboardPath
      ? "Manage time card notifications, Square setup, and billing from one place."
      : "Sign in to return to the page you were trying to open.";

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">Customer Access</div>
            <h1>{heading}</h1>
            <p>{intro}</p>
            <AuthForm googleEnabled={googleEnabled} nextPath={nextPath} />
          </article>

          <aside className="dashboard-card auth-card">
            <div className="eyebrow">What You Can Do</div>
            <h2>Everything important lives in one place</h2>
            <p>
              Once you are signed in, your dashboard gives you one place to
              manage notification setup, delivery testing, subscriptions, and
              account details.
            </p>
            <ul className="checklist compact-list">
              <li>Review your Time Card Manager notification settings.</li>
              <li>Connect Square and test live missed clock-out alerts.</li>
              <li>Manage your subscription, sender address, and account phone number.</li>
            </ul>
            <p>
              Use email and password today. Google sign-in can be turned on
              later if you decide to offer it.
            </p>
            <div className="credential-list">
              <div className="credential-item">
                <strong>Need a new account?</strong>
                Create one from the same form using the toggle above.
              </div>
              <div className="credential-item">
                <strong>Need help?</strong>
                If something looks off after sign-in, the dashboard will guide you to the next setup step.
              </div>
            </div>
            {isPreviewDeployment() ? (
              <p>
                Preview deployments stay on their Vercel URL, so Google sign-in
                remains hidden there unless that preview URL is explicitly registered.
              </p>
            ) : null}
          </aside>
        </section>
      </main>
    </>
  );
}
