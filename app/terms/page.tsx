import type { Metadata } from "next";
import { PublicSiteHeader } from "@/components/public-site-header";
import { supportEmail, supportHref } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Terms of Use | SLPCC63",
  description: "Terms for the SLPCC63 website, controlled product access, prototype use, and optional Time Card Manager messaging."
};

export default function TermsPage() {
  return <>
    <PublicSiteHeader />
    <main className="shell legal-page"><article className="legal-card">
      <div className="eyebrow">Updated October 23, 2026</div>
      <h1>Terms of Use</h1>
      <p>These terms describe use of the SLPCC63 public website and the tools linked from it. Contact <a href={supportHref}>{supportEmail}</a> with questions. A separately agreed customer or pilot agreement may set additional terms for that customer.</p>

      <h2>Current availability and pricing</h2>
      <p>Calendar Sync is a controlled pilot. Time Card Manager is available by assisted demo or controlled onboarding. Closing Checklist is an interactive prototype. Public paid self-service onboarding is not open. Signing in does not purchase a plan or automatically grant access. Any pilot scope, price, and enabled features must be confirmed during assisted onboarding before a purchase.</p>

      <h2>Authorized access</h2>
      <p>Owners and managers must be authorized to connect their business, access workforce information, and invite employees. Keep account credentials and private employee links secure. Do not use another organization’s account or links, bypass access controls, scrape private workforce data, or interfere with the service. Employees should use the link provided by their employer and ask their manager for help with access or work-record corrections.</p>

      <h2>Square and calendar boundaries</h2>
      <p>Square handles merchant authorization and remains the source of truth for published schedules and Square timecards. Calendar Sync is read-only; updates depend on Square publishing and the calendar provider’s refresh behavior. Do not rely on immediate calendar updates for urgent schedule changes. Employee time confirmations require manager review and are not automatically written back to Square in the current scope. Employers remain responsible for checking their official schedules, timekeeping, payroll, and employment records.</p>
      <p>SLPCC63 is a separate service. Square and third-party calendar, email, messaging, and hosting services have their own terms and availability.</p>

      <h2>Closing Checklist prototype</h2>
      <p>The prototype demonstrates sample tasks, exceptions, a manager summary, and a simulated clock-out. It resets on reload, does not persist checklist runs, and does not modify Square. Use sample information only. It is not an operational recordkeeping system or proof that an employee has clocked out.</p>

      <h2>Service limits and support</h2>
      <p>Pilot, demo, and prototype features may be incomplete, change, or be unavailable. Confirm a tool’s suitability with SLPCC63 before relying on it for business operations. No uninterrupted delivery, immediate refresh, or automated payroll outcome is promised by the public website. Access may be limited or suspended to address misuse, security concerns, or the agreed pilot scope. Contact <a href={supportHref}>{supportEmail}</a> for assistance.</p>

      <h2 id="sms">Optional Time Card Manager SMS terms</h2>
      <h3>Program name and purpose</h3>
      <p>SLPCC63 Time Card Manager is a non-marketing employee notification program. Where texting is enabled for an accepted customer, it sends time-confirmation requests, outstanding-response reminders, and response receipts. Secure links may be included so employees can confirm whether they worked and submit actual times for manager review. A description of SMS here does not mean texting is enabled for every account.</p>
      <h3>Enrollment and consent</h3>
      <p>Employees enroll voluntarily from a private Time Card Manager confirmation link. Enrollment requires a mobile number and an explicit consent checkbox. Consent to receive texts is not a condition of employment or purchase.</p>
      <h3>Message frequency and charges</h3>
      <p>Message frequency varies, typically 1–3 messages per week. Message and data rates may apply. Carriers are not liable for delayed or undelivered messages.</p>
      <h3>Opt out and help</h3>
      <p>Reply <strong>STOP</strong> to cancel. After opting out, you may receive one final confirmation message. Reply <strong>HELP</strong> for assistance, text <a href="tel:+15722216137">+1 572-221-6137</a>, or email <a href={supportHref}>{supportEmail}</a>. Text messages remain optional; your manager can continue using email where available.</p>
      <h3>Privacy and eligibility</h3>
      <p>The program is for employees invited by an authorized Time Card Manager account. Messaging may be suspended to prevent misuse or meet carrier, legal, or security requirements. Review the <a href="/privacy">Privacy Policy</a> for information handling, including mobile information and consent records.</p>

      <h2>Updates</h2>
      <p>Changes will be posted here with a revised date. Contact SLPCC63 before starting a pilot or changing an agreed service if you need clarification about the terms that apply.</p>
    </article></main>
  </>;
}
