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

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">App Sign-In</div>
            <h1>Sign in to the customer app</h1>
            <p>
              Better Auth is now wired in for email/password authentication,
              and Google sign-in can be enabled from your environment settings.
            </p>
            <AuthForm googleEnabled={googleEnabled} nextPath={nextPath} />
          </article>

          <aside className="dashboard-card auth-card">
            <div className="eyebrow">Better Auth</div>
            <h2>What changed</h2>
            <p>
              The temporary cookie-only auth flow is gone. Authentication now
              runs through Better Auth endpoints backed by Neon-hosted
              Postgres, and the app is ready for Google OAuth too.
            </p>
            <div className="credential-list">
              <div className="credential-item">
                <strong>Database</strong>
                <code>Neon Postgres via DATABASE_URL</code>
              </div>
              <div className="credential-item">
                <strong>Auth route</strong>
                <code>/api/auth/*</code>
              </div>
            </div>
            <p>
              Google OAuth needs a Google Cloud OAuth client with the Better
              Auth callback URL registered before the button will appear here.
            </p>
            <div className="credential-list">
              <div className="credential-item">
                <strong>Local callback</strong>
                <code>http://localhost:3000/api/auth/callback/google</code>
              </div>
              <div className="credential-item">
                <strong>Production callback</strong>
                <code>https://app.slpcc63.com/api/auth/callback/google</code>
              </div>
            </div>
            {isPreviewDeployment() ? (
              <p>
                Preview deployments stay on their Vercel URL, so Google sign-in
                is hidden there unless you explicitly register that preview URL
                in Google Cloud.
              </p>
            ) : null}
          </aside>
        </section>
      </main>
    </>
  );
}
