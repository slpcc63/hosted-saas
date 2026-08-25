import type { Metadata } from "next";

import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Employee SMS Consent | SLPCC63 Time Card Manager",
  description: "How employees opt in to Time Card Manager text notifications."
};

export default function SmsConsentInformationPage() {
  return (
    <>
      <SiteHeader />
      <main className="shell legal-page">
        <article className="legal-card consent-example-card">
          <div className="eyebrow">Employee SMS enrollment</div>
          <h1>Text notifications are optional</h1>
          <p>
            An employee first receives a private Time Card Manager confirmation link by
            email. On that secure page, the employee can provide a mobile number and
            affirmatively check the consent box shown below. No text is sent before the
            employee completes that step.
          </p>

          <section className="sms-consent-panel" aria-labelledby="consent-example-heading">
            <h2 id="consent-example-heading">Consent shown on the secure form</h2>
            <label className="field">
              <span>US mobile number</span>
              <input disabled placeholder="(555) 555-0123" type="tel" />
            </label>
            <label className="consent-checkbox">
              <input disabled type="checkbox" />
              <span>
                I agree to receive recurring SLPCC63 Time Card Manager texts about weekly
                time confirmations, reminders, and response receipts at the number
                provided. Message frequency varies, typically 1–3 messages per week.
                Message and data rates may apply. Consent is not a condition of employment.
                Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for help.
              </span>
            </label>
          </section>

          <p>
            Employees may review the <a href="/terms">SMS Terms and Conditions</a> and
            {" "}<a href="/privacy">Privacy Policy</a> before enrolling. Texting
            <strong> START</strong> is not used as an initial opt-in method.
          </p>
        </article>
      </main>
    </>
  );
}
