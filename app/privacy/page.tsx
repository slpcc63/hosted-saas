import type { Metadata } from "next";
import { PublicSiteHeader } from "@/components/public-site-header";
import { supportEmail, supportHref } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Privacy Policy | SLPCC63",
  description: "Privacy information for the SLPCC63 website, Calendar Sync, Time Card Manager, and Closing Checklist prototype."
};

export default function PrivacyPolicyPage() {
  return <>
    <PublicSiteHeader />
    <main className="shell legal-page"><article className="legal-card">
      <div className="eyebrow">Updated October 23, 2026</div>
      <h1>Privacy Policy</h1>
      <p>This notice describes information handled by SLPCC63 through slpcc63.com, its customer app, Calendar Sync, Time Card Manager, and the Closing Checklist prototype. For privacy questions or requests, contact <a href={supportHref}>{supportEmail}</a>.</p>

      <h2>Website visits and customer accounts</h2>
      <p>The public website provides product information and links to separate tools. Hosting services process technical request information, such as IP addresses, browser details, requested pages, and timestamps, to deliver and secure the website. The public pages do not include advertising or analytics tracking code.</p>
      <p>When you use the customer app, account information can include your name, email address, business and contact details, authentication records, account settings, and subscription records. Authentication uses session cookies. The public website does not require an account, and employees do not need an SLPCC63 account to use a valid employer-provided link.</p>

      <h2>Square connections and Calendar Sync</h2>
      <p>An authorized manager connects a Square merchant account through Square. The connected tools process merchant and team identifiers and the schedules or timecards permitted by that authorization. Square connection credentials are handled by the customer app, not by the public marketing pages.</p>
      <p>Calendar Sync uses employee and published-shift information to produce private, read-only calendar feeds. Your calendar provider receives the schedule information when you subscribe and may retain its own copy. Anyone holding a working private setup or calendar link may be able to read the schedule. Do not forward these links. A manager can pause, rotate, or remove a feed; copies already downloaded by a calendar provider may remain there.</p>

      <h2>Time Card Manager and employee responses</h2>
      <p>Information can include employee names, work email addresses, optional mobile numbers, schedules, timecards, missing-punch records, time confirmations, message-delivery details, replies, notification preferences, consent records, and manager review history. We use it to request confirmations, deliver enabled notifications, collect responses, support manager review, maintain an audit trail, and operate and secure the service. Employee responses are not automatically written back to Square in the current assisted-demo scope.</p>
      <p>Private response and digest links can provide access without an account. Keep them private and ask your manager for a replacement if a link is missing, expired, or exposed.</p>

      <h2>Closing Checklist prototype</h2>
      <p>The linked prototype uses sample checklist data. Checklist changes and exception reasons are held for the current demo session and reset when the page reloads. It does not save operational checklist runs, connect to your Square account, or perform a real clock-out. Do not enter real employee, customer, payment, or other sensitive information into the prototype. Normal hosting request logs are separate from the resetting checklist data.</p>

      <h2>Service providers and sharing</h2>
      <p>Hosting and database providers, Square, enabled email or messaging providers, and a calendar provider you choose process information needed for their part of the service. Their own privacy practices also apply. Information may also be disclosed when required by law or needed to investigate misuse and protect the service.</p>
      <p>Mobile numbers, SMS consent records, and messaging data are not sold or shared with third parties or affiliates for marketing or promotional purposes. We provide them to service providers only as needed to operate and secure Time Card Manager or when required by law.</p>

      <h2>Choices, retention, and requests</h2>
      <p>Contact your employer first to correct work schedules, time records, or access permissions. For questions about information held by SLPCC63 or to request access, correction, or deletion, email <a href={supportHref}>{supportEmail}</a>. We may need to confirm your identity and coordinate with the employer that supplied the records before handling a request.</p>
      <p>Account, workforce, consent, and audit records do not all expire automatically. Removing a feed or disconnecting Square does not erase messages or calendar copies already delivered. Retention and deletion requests must account for operational, security, employer-recordkeeping, and legal requirements; this release does not promise immediate deletion of every copy or backup.</p>
      <p>SMS participation is optional. Reply <strong>STOP</strong> to opt out or <strong>HELP</strong> for assistance. Message and data rates may apply. See the <a href="/terms#sms">SMS terms</a> for details. Opting out of texts does not by itself remove existing work or consent records.</p>

      <h2>Changes and contact</h2>
      <p>Updates will appear here with a revised date. Contact SLPCC63 at <a href={supportHref}>{supportEmail}</a> about this notice, a privacy request, or a suspected exposed private link. Do not include passwords, Square credentials, or a full private employee link in an initial support email.</p>
      <p><a href="/terms">Read the Terms of Use</a></p>
    </article></main>
  </>;
}
