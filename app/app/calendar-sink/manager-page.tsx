import { headers } from "next/headers";

import { SiteHeader } from "@/components/site-header";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { getSquareCalendarSinkOverview } from "@/lib/square-calendar-sink";
import {
  createSquareCalendarSinkFeedAction,
  deleteSquareCalendarSinkFeedAction,
  rotateSquareCalendarSinkFeedAction,
  setSquareCalendarSinkEnabledAction
} from "./actions";

export type CalendarSinkManagerPageProps = {
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

function teamMemberName(member: {
  family_name?: string;
  given_name?: string;
  id: string;
}) {
  return [member.given_name, member.family_name].filter(Boolean).join(" ") || member.id;
}

export async function CalendarSinkManagerPage({ searchParams }: CalendarSinkManagerPageProps) {
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
  const squareReady = overview.connected && overview.missingScopes.length === 0;
  const configuredTeamMemberIds = new Set(
    overview.feeds
      .map((feed) => feed.teamMemberId)
      .filter((teamMemberId): teamMemberId is string => Boolean(teamMemberId))
  );
  const availableTeamMembers = overview.teamMembers.filter(
    (member) => !configuredTeamMemberIds.has(member.id)
  );
  const activeFeedCount = overview.feeds.filter((feed) => feed.enabled).length;

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard calendar-sink-page">
        <header className="calendar-sink-hero calendar-manager-hero">
          <div>
            <div className="eyebrow">Square Calendar Sync</div>
            <h1>Manage employee calendars</h1>
            <p>
              Create one private, read-only calendar feed for each employee. Square remains the
              source of truth; employees only subscribe to the schedule you publish there.
            </p>
          </div>
          <div className="calendar-status-row" aria-label="Calendar Sync status">
            <span className={`calendar-status ${squareReady ? "ready" : "attention"}`}>
              <span aria-hidden="true" className="calendar-status-dot" />
              {squareReady ? "Square connected" : "Square needs attention"}
            </span>
            <span className={`calendar-status ${activeFeedCount ? "ready" : "muted"}`}>
              <span aria-hidden="true" className="calendar-status-dot" />
              {activeFeedCount} active {activeFeedCount === 1 ? "feed" : "feeds"}
            </span>
          </div>
        </header>

        <div aria-live="polite" className="calendar-sink-messages">
          {params?.saved === "feed_created" ? (
            <p className="form-success">Employee calendar created. Its private setup page is ready to share.</p>
          ) : null}
          {params?.saved === "square_connection" ? (
            <p className="form-success">Square connected successfully.</p>
          ) : null}
          {params?.saved === "feed_rotated" ? (
            <p className="form-success">A new private address was created. Give the employee their new setup page.</p>
          ) : null}
          {params?.saved === "feed_disabled" ? (
            <p className="form-success">Employee calendar paused. Its feed now returns Not Found.</p>
          ) : null}
          {params?.saved === "feed_enabled" ? (
            <p className="form-success">Employee calendar enabled.</p>
          ) : null}
          {params?.saved === "feed_deleted" ? (
            <p className="form-success">Employee calendar deleted. Its private addresses no longer work.</p>
          ) : null}
          {params?.error === "team_member_required" ? (
            <p className="form-error">Choose an employee from the Square roster.</p>
          ) : null}
          {params?.error === "feed_required" ? (
            <p className="form-error">Choose an employee calendar to manage.</p>
          ) : null}
        </div>

        {!squareReady ? (
          <section className="dashboard-card calendar-connect-card">
            <div className="dashboard-alert warning">
              <strong>{overview.connected ? "Reconnect Square" : "Connect Square"}</strong>
              <p>
                {overview.connectionError === "authentication"
                  ? "The saved Square connection is no longer valid. Reconnect Square to manage employee calendars."
                  : "Calendar Sync needs permission to read published shifts and active team members."}
              </p>
              <a className="pill primary" href="/api/integrations/square/connect?plugin=square-calendar-sink">
                {overview.connected ? "Reconnect Square" : "Connect Square"}
              </a>
            </div>
          </section>
        ) : (
          <div className="calendar-manager-setup-grid">
            <section className="dashboard-card calendar-add-employee-card">
              <div className="calendar-card-heading">
                <div>
                  <span className="calendar-step">1</span>
                  <p className="calendar-card-kicker">Company setup</p>
                  <h2>Add an employee calendar</h2>
                </div>
              </div>
              {availableTeamMembers.length ? (
                <form action={createSquareCalendarSinkFeedAction} className="auth-form calendar-settings-form">
                  <label>
                    Square employee
                    <select name="teamMemberId" defaultValue="" required>
                      <option value="" disabled>Choose an employee</option>
                      {availableTeamMembers.map((member) => (
                        <option value={member.id} key={member.id}>{teamMemberName(member)}</option>
                      ))}
                    </select>
                  </label>
                  <p className="calendar-field-help">
                    This creates a unique private feed containing only that employee&apos;s published shifts.
                  </p>
                  <button className="pill primary pill-button calendar-primary-action" type="submit">
                    Create employee calendar
                  </button>
                </form>
              ) : (
                <div className="calendar-empty-state">
                  <strong>Every active Square employee has a calendar.</strong>
                  <p>New employees will appear here after they are added to your Square team.</p>
                </div>
              )}
            </section>

            <section className="dashboard-card calendar-rollout-card">
              <div className="calendar-card-heading">
                <div>
                  <span className="calendar-step">2</span>
                  <p className="calendar-card-kicker">Employee rollout</p>
                  <h2>Share each setup page</h2>
                </div>
              </div>
              <ol className="calendar-subscribe-steps calendar-manager-steps">
                <li>Create a calendar for each person on the Square roster.</li>
                <li>Open their private setup page and send that page only to them.</li>
                <li>They subscribe once; future published Square changes update automatically.</li>
              </ol>
              <div className="calendar-private-note">
                <strong>Each employee address is private.</strong>
                <span>Pause or replace an individual address if it is shared with the wrong person.</span>
              </div>
            </section>
          </div>
        )}

        <section className="calendar-employee-section">
          <div className="calendar-section-heading">
            <div>
              <p className="calendar-card-kicker">Employee calendars</p>
              <h2>Calendar roster</h2>
              <p>Manage access and send each employee their own subscription page.</p>
            </div>
            <span className="status-chip">
              {overview.feeds.length} {overview.feeds.length === 1 ? "employee" : "employees"}
            </span>
          </div>

          {overview.feeds.length ? (
            <div className="calendar-employee-grid">
              {overview.feeds.map((feed) => {
                const feedUrl = `${protocol}://${host}/api/calendar/square/${feed.feedToken}`;
                const setupUrl = `${protocol}://${host}${routing.appHost ? "" : "/app"}/calendar-sink/subscribe/${feed.feedToken}`;
                const webcalUrl = feedUrl.replace(/^https?:/, "webcal:");

                return (
                  <article className="dashboard-card calendar-employee-card" key={feed.id}>
                    <div className="calendar-employee-topline">
                      <div>
                        <h3>{feed.teamMemberName}</h3>
                        <p>{feed.upcomingShiftCount} upcoming published {feed.upcomingShiftCount === 1 ? "shift" : "shifts"}</p>
                      </div>
                      <span className={`status-chip ${feed.enabled ? "calendar-chip-ready" : ""}`}>
                        {feed.enabled ? "Active" : "Paused"}
                      </span>
                    </div>

                    <label className="calendar-feed-field">
                      <span>Private employee setup page</span>
                      <input readOnly value={setupUrl} />
                    </label>

                    <div className="calendar-subscribe-actions">
                      {feed.enabled ? (
                        <>
                          <a className="pill primary" href={setupUrl} target="_blank" rel="noreferrer">
                            Open employee page
                          </a>
                          <a className="pill" href={webcalUrl}>Subscribe in Apple Calendar</a>
                        </>
                      ) : null}
                    </div>

                    <details className="calendar-feed-controls">
                      <summary>Manage {feed.teamMemberName}&apos;s feed</summary>
                      <label className="calendar-feed-field calendar-feed-field-compact">
                        <span>Direct ICS address</span>
                        <input readOnly value={feedUrl} />
                      </label>
                      <div className="calendar-secondary-actions">
                        <form action={setSquareCalendarSinkEnabledAction}>
                          <input name="feedId" type="hidden" value={feed.id} />
                          <input name="enabled" type="hidden" value={feed.enabled ? "false" : "true"} />
                          <button className="pill pill-button" type="submit">
                            {feed.enabled ? "Pause feed" : "Enable feed"}
                          </button>
                        </form>
                        <form action={rotateSquareCalendarSinkFeedAction}>
                          <input name="feedId" type="hidden" value={feed.id} />
                          <button className="pill pill-button" type="submit">Replace private address</button>
                        </form>
                      </div>
                      <details className="calendar-delete-controls">
                        <summary>Delete employee calendar</summary>
                        <p>This permanently revokes the setup page and subscribed feed.</p>
                        <form action={deleteSquareCalendarSinkFeedAction}>
                          <input name="feedId" type="hidden" value={feed.id} />
                          <button className="pill pill-button calendar-danger-button" type="submit">
                            Delete {feed.teamMemberName}&apos;s calendar
                          </button>
                        </form>
                      </details>
                    </details>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="dashboard-card calendar-empty-state calendar-roster-empty">
              <strong>No employee calendars yet.</strong>
              <p>Connect Square and create the first employee calendar above.</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
