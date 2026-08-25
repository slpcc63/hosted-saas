import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "SMS Terms | SLPCC63 Time Card Manager",
  description: "SMS terms and conditions for SLPCC63 Time Card Manager."
};

export default function SmsTermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <article className="legal-card">
          <div className="eyebrow">Effective August 24, 2026</div>
          <h1>SMS Terms and Conditions</h1>

          <h2>Program name and purpose</h2>
          <p>
            SLPCC63 Time Card Manager is a non-marketing employee notification program.
            It sends weekly time-confirmation requests, outstanding-response reminders,
            and response receipts. Secure links may be included so employees can confirm
            whether they worked and submit their actual time for manager review.
          </p>

          <h2>Enrollment and consent</h2>
          <p>
            Employees enroll voluntarily from a private Time Card Manager confirmation
            link. Enrollment requires the employee to provide a mobile number and check an
            explicit consent box. Consent to receive texts is not a condition of employment
            or purchase.
          </p>

          <h2>Message frequency and charges</h2>
          <p>
            Message frequency varies, typically 1–3 messages per week. Message and data
            rates may apply. Carriers are not liable for delayed or undelivered messages.
          </p>

          <h2>Opt out and help</h2>
          <p>
            Reply <strong>STOP</strong> to cancel. After opting out, you may receive one
            final confirmation message. Reply <strong>HELP</strong> for help or text
            {" "}<a href="tel:+15722216137">+1 572-221-6137</a>. Text messages remain
            optional; your manager can continue using email where available.
          </p>

          <h2>Privacy and eligibility</h2>
          <p>
            Review our <a href="/privacy">Privacy Policy</a> for how mobile information is
            handled. The program is intended for employees invited by an authorized Time
            Card Manager account. We may suspend messaging to prevent misuse or comply
            with carrier, legal, or security requirements.
          </p>
        </article>
      </main>
    </>
  );
}
