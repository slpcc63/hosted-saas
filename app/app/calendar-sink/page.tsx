import { headers } from "next/headers";

import { SiteHeader } from "@/components/site-header";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { getSquareCalendarSinkOverview } from "@/lib/square-calendar-sink";
import {
  rotateSquareCalendarSinkFeedAction,
  saveSquareCalendarSinkSettingsAction,
  setSquareCalendarSinkEnabledAction
} from "./actions";

type CalendarSinkPageProps = {
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

function teamMemberName(member: {
  family_name?: string;
  given_name?: string;
  id: string;
}) {
  return [member.given_name, member.family_name].filter(Boolean).join(" ") || member.id;
}

export default async function CalendarSinkPage({ searchParams }: CalendarSinkPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/calendar-sink" : "/app/calendar-sink";
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  const [overview, requestHeaders, params] = await Promise.all([
    getSquareCalendarSinkOverview(customer.id),
    headers(),
    searchParams
  ]);
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "hosted-saas.vercel.app";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const feedUrl = overview.settings
    ? `${protocol}://${host}/api/calendar/square/${overview.settings.feedToken}`
    : null;
  const webcalUrl = feedUrl?.replace(/^https?:/, "webcal:") ?? null;
  const squareReady = overview.connected && overview.missingScopes.length === 0;
  const feedReady = Boolean(overview.settings?.teamMemberId && feedUrl && webcalUrl);

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard calendar-sink-page">
        <header className="calendar-sink-hero">
          <div>
            <div className="eyebrow">Square Calendar Sync</div>
            <h1>Your Square schedule, everywhere</h1>
            <p>
              Published Square shifts flow into a private, read-only calendar. Make schedule
              changes in Square and they will appear automatically after your calendar refreshes.
            </p>
          </div>
          <div className="calendar-status-row" aria-label="Calendar Sync status">
            <span className={`calendar-status ${squareReady ? "ready" : "attention"}`}>
              <span aria-hidden="true" className="calendar-status-dot" />
              {squareReady ? "Square connected" : "Square needs attention"}
            </span>
            <span className={`calendar-status ${overview.settings?.enabled ? "ready" : "muted"}`}>
              <span aria-hidden="true" className="calendar-status-dot" />
              {overview.settings?.enabled ? "Feed active" : "Feed paused"}
            </span>
          </div>
        </header>

        <div aria-live="polite" className="calendar-sink-messages">
          {params?.saved === "settings" ? (
            <p className="form-success">Calendar sync settings saved.</p>
          ) : null}
          {params?.saved === "square_connection" ? (
            <p className="form-success">Square connected successfully.</p>
          ) : null}
          {params?.saved === "feed_rotated" ? (
            <p className="form-success">
              A new private calendar address was created. Subscribe again using the new address.
            </p>
          ) : null}
          {params?.saved === "feed_disabled" ? (
            <p className="form-success">Calendar feed disabled. Its private address now returns Not Found.</p>
          ) : null}
          {params?.saved === "feed_enabled" ? (
            <p className="form-success">Calendar feed enabled.</p>
          ) : null}
          {params?.error === "team_member_required" ? (
            <p className="form-error">Choose the Square team member whose shifts should sync.</p>
          ) : null}
        </div>

        <div className="calendar-sink-grid">
          <section className="dashboard-card calendar-setup-card">
            <div className="calendar-card-heading">
              <div>
                <span className="calendar-step">1</span>
                <p className="calendar-card-kicker">Schedule source</p>
                <h2>Choose whose shifts to sync</h2>
              </div>
              <span className={`status-chip ${squareReady ? "calendar-chip-ready" : ""}`}>
                {squareReady ? "Connected" : "Action needed"}
              </span>
            </div>

            {!squareReady ? (
              <div className="dashboard-alert warning">
                <strong>{overview.connected ? "Reconnect Square" : "Connect Square"}</strong>
                <p>
                  {overview.connectionError === "authentication"
                    ? "The saved Square connection is no longer valid. Reconnect Square to continue."
                    : "Schedule sync needs permission to read published shifts and active team members."}
                </p>
                <a className="pill primary" href="/api/integrations/square/connect?plugin=square-calendar-sink">
                  {overview.connected ? "Reconnect Square" : "Connect Square"}
                </a>
              </div>
            ) : (
              <form action={saveSquareCalendarSinkSettingsAction} className="auth-form calendar-settings-form">
                <label>
                  Square team member
                  <select name="teamMemberId" defaultValue={overview.settings?.teamMemberId ?? ""} required>
                    <option value="" disabled>Choose your name</option>
                    {overview.teamMembers.map((member) => (
                      <option value={member.id} key={member.id}>{teamMemberName(member)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Calendar name
                  <input name="calendarName" defaultValue={overview.settings?.calendarName ?? "Work"} maxLength={80} />
                </label>
                <p className="calendar-field-help">
                  Only published shifts for this person will appear in the feed.
                </p>
                <button className="pill primary pill-button calendar-primary-action" type="submit">
                  Save settings
                </button>
              </form>
            )}
          </section>

          <section className="dashboard-card calendar-subscribe-card">
            <div className="calendar-card-heading">
              <div>
                <span className="calendar-step">2</span>
                <p className="calendar-card-kicker">Calendar subscription</p>
                <h2>Add the private feed once</h2>
              </div>
              <span className={`status-chip ${overview.settings?.enabled ? "calendar-chip-ready" : ""}`}>
                {overview.settings?.enabled ? "Active" : "Paused"}
              </span>
            </div>

            {feedReady && overview.settings && feedUrl && webcalUrl ? (
              <>
                <div className="calendar-private-note">
                  <strong>Keep this address private.</strong>
                  <span>Anyone with the link can view the shifts in this feed.</span>
                </div>
                <label className="calendar-feed-field">
                  <span>Private calendar address</span>
                  <input aria-label="Private calendar address" readOnly value={feedUrl} />
                </label>
                <div className="calendar-subscribe-actions">
                  {overview.settings.enabled ? (
                    <>
                      <a className="pill primary" href={webcalUrl}>Subscribe in Apple Calendar</a>
                      <a
                        className="pill"
                        href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Add to Google Calendar
                      </a>
                      <a className="pill" href={feedUrl} target="_blank" rel="noreferrer">Test ICS feed</a>
                    </>
                  ) : null}
                </div>

                <ol className="calendar-subscribe-steps">
                  <li>Subscribe once and save it to iCloud so it appears on all Apple devices.</li>
                  <li>Set Auto-refresh to every 5 minutes when Apple Calendar asks.</li>
                  <li>Edit shifts only in Square; this calendar is intentionally read-only.</li>
                </ol>

                <details className="calendar-feed-controls">
                  <summary>Manage private feed</summary>
                  <p>Pause access or replace the address if you believe the private link was shared.</p>
                  <div className="calendar-secondary-actions">
                    <form action={setSquareCalendarSinkEnabledAction}>
                      <input name="enabled" type="hidden" value={overview.settings.enabled ? "false" : "true"} />
                      <button className="pill pill-button" type="submit">
                        {overview.settings.enabled ? "Pause feed" : "Enable feed"}
                      </button>
                    </form>
                    <form action={rotateSquareCalendarSinkFeedAction}>
                      <button className="pill pill-button" type="submit">Replace private address</button>
                    </form>
                  </div>
                </details>
              </>
            ) : (
              <div className="calendar-empty-state">
                <strong>Finish step 1 first.</strong>
                <p>Your private subscription address will appear after you connect Square and choose a team member.</p>
              </div>
            )}
          </section>

          <section className="dashboard-card calendar-shifts-card">
            <div className="calendar-card-heading">
              <div>
                <p className="calendar-card-kicker">Live preview</p>
                <h2>Upcoming published shifts</h2>
              </div>
              <span className="status-chip">
                {overview.upcomingShifts.length} {overview.upcomingShifts.length === 1 ? "shift" : "shifts"}
              </span>
            </div>
            {overview.upcomingShifts.length ? (
              <ul className="calendar-shift-list">
                {overview.upcomingShifts.slice(0, 12).map((shift) => {
                  const details = shift.published_shift_details;
                  if (!details) return null;

                  const startAt = new Date(details.start_at);
                  const endAt = new Date(details.end_at);
                  const dateLabel = startAt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    timeZone: details.timezone
                  });
                  const startLabel = startAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: details.timezone
                  });
                  const endLabel = endAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: details.timezone
                  });

                  return (
                    <li className="calendar-shift-row" key={shift.id}>
                      <time dateTime={details.start_at}>{dateLabel}</time>
                      <div>
                        <strong>{startLabel}–{endLabel}</strong>
                        <span>Published in Square</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="calendar-empty-state">
                <strong>No upcoming shifts yet.</strong>
                <p>Publish a future shift in Square and it will appear here automatically.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
