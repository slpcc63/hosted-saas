import { redirect } from "next/navigation";

import { safeNextPath } from "@/lib/auth-config";
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
  const nextPath = safeNextPath(params?.next, routing.dashboardPath);

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">App Sign-In</div>
            <h1>Sign in to the customer app</h1>
            <p>
              Sign in with the account arranged during assisted onboarding. Public account registration is not open.
            </p>
            <AuthForm googleEnabled={googleEnabled} nextPath={nextPath} />
          </article>

          <aside className="dashboard-card auth-card">
            <h2>Need access?</h2>
            <p>Contact <a href="mailto:support@slpcc63.com">support@slpcc63.com</a> to arrange a controlled pilot or assisted demo.</p>
            <p>Employees can use private calendar or time-confirmation links from their employer without creating an account.</p>
            <p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>
          </aside>
        </section>
      </main>
    </>
  );
}
