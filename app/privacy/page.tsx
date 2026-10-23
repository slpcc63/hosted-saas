import type { Metadata } from "next";

import { PublicSiteHeader } from "@/components/public-site-header";

export const metadata: Metadata = {
  title: "Privacy Policy | SLPCC63 Time Card Manager",
  description: "Privacy practices for SLPCC63 Time Card Manager notifications."
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <PublicSiteHeader />
      <main className="shell legal-page">
        <article className="legal-card">
          <div className="eyebrow">Effective August 24, 2026</div>
          <h1>Privacy Policy</h1>
          <p>
            This policy explains how SLPCC63 Time Card Manager handles information used
            to request, receive, and review employee time confirmations.
          </p>

          <h2>Information we collect</h2>
          <p>
            We may collect an employee&apos;s name, work email address, mobile number,
            notification preferences, consent records, scheduled-work information, time
            responses, message-delivery details, and replies. We also retain manager
            review decisions and an audit history needed to operate the service.
          </p>

          <h2>How we use information</h2>
          <p>
            We use this information to deliver time-confirmation requests and reminders,
            provide secure response forms, process employee replies, notify managers,
            maintain compliance records, prevent misuse, and support the service.
          </p>

          <h2>Mobile information and sharing</h2>
          <p>
            Mobile numbers, SMS consent records, and messaging data are not sold or shared
            with third parties or affiliates for marketing or promotional purposes. We may
            provide information to service providers such as messaging, email, hosting, and
            workforce-platform vendors only as needed to operate and secure Time Card
            Manager, or when required by law.
          </p>

          <h2>Choices and retention</h2>
          <p>
            SMS participation is optional. Reply <strong>STOP</strong> to stop text
            messages or <strong>HELP</strong> for assistance. Message and data rates may
            apply. We retain consent and operational records only as long as reasonably
            necessary for service, security, legal, and audit purposes.
          </p>

          <h2>Questions</h2>
          <p>
            For Time Card Manager messaging support, text <strong>HELP</strong> to
            {" "}<a href="tel:+15722216137">+1 572-221-6137</a>. See the
            {" "}<a href="/terms">SMS Terms and Conditions</a> for program details.
          </p>
        </article>
      </main>
    </>
  );
}
