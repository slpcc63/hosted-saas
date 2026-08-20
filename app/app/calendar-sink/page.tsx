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

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Square Calendar Sync</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Put your Square schedule in Apple Calendar</h1>
            <p>
              Square remains the source of truth. Apple Calendar subscribes to a private,
              read-only feed of your published shifts.
            </p>

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

            {!squareReady ? (
              <div className="dashboard-alert warning">
                <strong>{overview.connected ? "Reconnect Square" : "Connect Square"}</strong>
                <p>
                  Schedule sync needs permission to read published shifts and active team members.
                </p>
                <a className="pill primary" href="/api/integrations/square/connect?plugin=square-calendar-sink">
                  {overview.connected ? "Reconnect Square" : "Connect Square"}
                </a>
              </div>
            ) : (
              <form action={saveSquareCalendarSinkSettingsAction} className="auth-form">
                <label>
                  Your Square team member
                  <select name="teamMemberId" defaultValue={overview.settings?.teamMemberId ?? ""} required>
                    <option value="" disabled>Choose your name</option>
                    {overview.teamMembers.map((member) => (
                      <option value={member.id} key={member.id}>{teamMemberName(member)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Apple Calendar name
                  <input name="calendarName" defaultValue={overview.settings?.calendarName ?? "Work"} maxLength={80} />
                </label>
                <button className="pill primary" type="submit">Save calendar sync</button>
              </form>
            )}
          </section>

          <section className="dashboard-card">
            <h2>Subscribe to your work schedule</h2>
            {overview.settings?.teamMemberId && feedUrl && webcalUrl ? (
              <>
                <p>
                  This address is private. Anyone who has it can see the work times in this feed.
                </p>
                <p>
                  Feed status: <strong>{overview.settings.enabled ? "Enabled" : "Disabled"}</strong>
                </p>
                <input aria-label="Private calendar address" readOnly value={feedUrl} />
                <div className="button-row">
                  {overview.settings.enabled ? (
                    <>
                      <a className="pill primary" href={webcalUrl}>Subscribe in Apple Calendar</a>
                      <a className="pill" href={feedUrl} target="_blank" rel="noreferrer">Open ICS feed</a>
                      <a
                        className="pill"
                        href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Google Calendar
                      </a>
                    </>
                  ) : null}
                  <form action={setSquareCalendarSinkEnabledAction}>
                    <input name="enabled" type="hidden" value={overview.settings.enabled ? "false" : "true"} />
                    <button className="pill" type="submit">
                      {overview.settings.enabled ? "Disable feed" : "Enable feed"}
                    </button>
                  </form>
                  <form action={rotateSquareCalendarSinkFeedAction}>
                    <button className="pill" type="submit">Replace private address</button>
                  </form>
                </div>
                <p>
                  On iPhone: Calendar → Calendars → Add Calendar → Add Subscription Calendar.
                  Choose iCloud as the account so it appears on all your Apple devices. In Google
                  Calendar, choose “From URL” and paste the private address above.
                </p>
              </>
            ) : (
              <p>Connect Square and choose your name first. Your private subscription address will appear here.</p>
            )}
          </section>

          <section className="dashboard-card">
            <h2>Upcoming published shifts</h2>
            {overview.upcomingShifts.length ? (
              <ul className="feature-list">
                {overview.upcomingShifts.slice(0, 12).map((shift) => {
                  const details = shift.published_shift_details;
                  return details ? (
                    <li key={shift.id}>
                      <strong>
                        {new Date(details.start_at).toLocaleString("en-US", {
                          timeZone: details.timezone
                        })}
                      </strong>
                      <span>
                        {" "}to {new Date(details.end_at).toLocaleTimeString("en-US", {
                          timeZone: details.timezone
                        })}
                      </span>
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p>No future published shifts were found for the selected team member.</p>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
