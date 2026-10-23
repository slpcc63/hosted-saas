import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getCalendarSinkAccessState } from "@/lib/calendar-sink-access";
import { getSquareCalendarSinkSubscription } from "@/lib/square-calendar-sink";
import { CopyFeedButton } from "./copy-feed-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Subscribe to your work schedule"
};

type EmployeeSubscriptionPageProps = {
  params: Promise<{ token: string }>;
};

export default async function EmployeeSubscriptionPage({ params }: EmployeeSubscriptionPageProps) {
  const { token } = await params;
  const [settings, requestHeaders] = await Promise.all([
    getSquareCalendarSinkSubscription(token),
    headers()
  ]);

  const accessState = getCalendarSinkAccessState(settings);

  if (accessState === "not_found" || !settings) {
    notFound();
  }

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "app.slpcc63.com";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const feedUrl = `${protocol}://${host}/api/calendar/square/${settings.feedToken}`;
  const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

  return (
    <main className="calendar-employee-subscription-shell">
      <a className="brand" href="https://slpcc63.com">SLPCC63</a>
      <section className="dashboard-card calendar-employee-subscription-card">
        <div className="eyebrow">Square Calendar Sync</div>
        {accessState === "active" ? (
          <>
            <h1>Add your work schedule</h1>
            <p>
              Your employer created <strong>{settings.calendarName}</strong> for you. No SLPCC63
              account or sign-in is required.
            </p>

            <ul className="calendar-setup-facts">
              <li>Set it up once; your calendar provider refreshes it automatically.</li>
              <li>Only shifts your employer has published in Square appear.</li>
              <li>Updates are automatic, but they may not appear immediately.</li>
            </ul>

            <div className="calendar-private-note">
              <strong>This page is private.</strong>
              <span>Do not forward it. Anyone with this page can access your work schedule.</span>
            </div>

            <div className="calendar-provider-options">
              <section className="calendar-provider-option calendar-provider-primary">
                <p className="calendar-provider-label">Apple Calendar</p>
                <h2>One-tap setup</h2>
                <p>Open the subscription prompt, confirm the calendar, and save it.</p>
                <a className="pill primary" href={webcalUrl}>Add to Apple Calendar</a>
              </section>

              <section className="calendar-provider-option">
                <p className="calendar-provider-label">Google Calendar</p>
                <h2>Use a computer browser</h2>
                <p>
                  The Google Calendar mobile app cannot add a calendar subscription directly.
                  On a computer, copy this address and add it under Other calendars → From URL.
                </p>
                <div className="calendar-employee-subscription-actions">
                  <CopyFeedButton feedUrl={feedUrl} />
                  <a
                    className="pill"
                    href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Calendar on a computer
                  </a>
                </div>
              </section>
            </div>

            <p className="calendar-read-only-note">
              This calendar is read-only. Your employer continues to publish schedule changes in Square.
            </p>

            <details className="calendar-other-apps">
              <summary>Other calendar apps</summary>
              <p>Copy the private calendar address into an app that supports subscribed ICS calendars.</p>
              <div className="calendar-employee-subscription-actions">
                <CopyFeedButton feedUrl={feedUrl} label="Copy private calendar address" />
                <a className="pill" href={feedUrl} target="_blank" rel="noreferrer">Open calendar file</a>
              </div>
            </details>
          </>
        ) : (
          <div className="calendar-subscription-paused">
            <h1>This calendar is paused</h1>
            <p>Ask your manager to enable the employee calendar or send you a new private setup page.</p>
          </div>
        )}
      </section>
      <p className="calendar-subscription-footer">Schedule information comes directly from Square.</p>
    </main>
  );
}
