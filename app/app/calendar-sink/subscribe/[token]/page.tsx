import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

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

  if (!settings) {
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
        {settings.enabled ? (
          <>
            <h1>Add your work schedule</h1>
            <p>
              Subscribe once to <strong>{settings.calendarName}</strong>. Published Square schedule
              changes will appear automatically when your calendar refreshes.
            </p>

            <div className="calendar-private-note">
              <strong>This page is private.</strong>
              <span>Do not forward it. Anyone with this page can access your work schedule.</span>
            </div>

            <div className="calendar-employee-subscription-actions">
              <a className="pill primary" href={webcalUrl}>Add to Apple Calendar</a>
              <a
                className="pill"
                href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                target="_blank"
                rel="noreferrer"
              >
                Open Google Calendar
              </a>
              <CopyFeedButton feedUrl={feedUrl} />
              <a className="pill" href={feedUrl} target="_blank" rel="noreferrer">Open raw ICS feed</a>
            </div>

            <ol className="calendar-subscribe-steps calendar-employee-instructions">
              <li><strong>Apple:</strong> choose Add to Apple Calendar, save to iCloud, and set Auto-refresh to every 5 minutes.</li>
              <li><strong>Google:</strong> copy the calendar address, open Google Calendar, then choose Other calendars → From URL.</li>
              <li>Make schedule changes in Square. This subscribed calendar is read-only.</li>
            </ol>
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
