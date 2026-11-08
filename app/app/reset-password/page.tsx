import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SiteHeader } from "@/components/site-header";
import { getPublicRouting } from "@/lib/request-routing";

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    error?: string;
    token?: string;
  }>;
};

export default async function ResetPasswordPage({
  searchParams
}: ResetPasswordPageProps) {
  const routing = await getPublicRouting();
  const params = await searchParams;
  const invalidToken = params?.error === "INVALID_TOKEN";

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">Account Security</div>
            <h1>Choose a new password</h1>
            <p>
              Use at least eight characters. This reset link expires after one
              hour and can only be used once.
            </p>
            <ResetPasswordForm
              initialError={
                invalidToken
                  ? "This password reset link is invalid or has expired. Request a new one."
                  : undefined
              }
              signInPath={routing.signInPath}
              token={params?.token}
            />
          </article>
        </section>
      </main>
    </>
  );
}
