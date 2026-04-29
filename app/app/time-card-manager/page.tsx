import { SiteHeader } from "@/components/site-header";
import {
  addTimeCardManagerScheduleEntryAction,
  removeTimeCardManagerScheduleEntryAction,
  scanSquareMissedClockOutsAction,
  sendTimeCardManagerMissedClockOutEmailAction,
  sendTimeCardManagerTestEmailAction,
  saveTimeCardManagerSenderAction,
  saveTimeCardManagerSettingsAction
} from "@/app/app/actions";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import {
  getTimeCardManagerOverview,
  getTimeCardManagerSquareStatus,
  requiredSquareLaborScopes
} from "@/lib/square-time-card-manager";

const weekdayOptions = [
  { label: "Sunday", value: 0 },
  { label: "Monday", value: 1 },
  { label: "Tuesday", value: 2 },
  { label: "Wednesday", value: 3 },
  { label: "Thursday", value: 4 },
  { label: "Friday", value: 5 },
  { label: "Saturday", value: 6 }
];

function labelForDay(dayOfWeek: number) {
  return weekdayOptions.find((option) => option.value === dayOfWeek)?.label ?? "Day";
}

type TimeCardManagerPageProps = {
  searchParams?: Promise<{
    count?: string;
    error?: string;
    saved?: string;
  }>;
};

export default async function TimeCardManagerPage({
  searchParams
}: TimeCardManagerPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost ? "/time-card-manager" : "/app/time-card-manager";
  const subscriptionsPath = routing.appHost ? "/subscriptions" : "/app/subscriptions";
  const squareConnectHref = `/api/integrations/square/connect?plugin=square-time-card-manager`;
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  await ensureSeedCatalog();
  const [overview, squareStatus] = await Promise.all([
    getTimeCardManagerOverview(customer.id),
    getTimeCardManagerSquareStatus(customer.id)
  ]);
  const params = await searchParams;

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Square Time Card Manager</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Notification controls</h1>
            <p>
              Configure how often the time card manager runs and whether it uses
              email, text, or both. Text delivery is still governed by your
              subscribed package and monthly quota.
            </p>
            {overview.alertMessage ? (
              <div className="dashboard-alert warning">
                <strong>Notification limit reached</strong>
                <p>{overview.alertMessage}</p>
                <a className="pill" href={subscriptionsPath}>
                  Manage subscription
                </a>
              </div>
            ) : null}
            {params?.saved === "settings" ? (
              <p className="form-success">Time card manager settings saved.</p>
            ) : null}
            {params?.saved === "schedule" ? (
              <p className="form-success">Schedule entry added.</p>
            ) : null}
            {params?.saved === "schedule_removed" ? (
              <p className="form-success">Schedule entry removed.</p>
            ) : null}
            {params?.saved === "sender" ? (
              <p className="form-success">Notification sender saved.</p>
            ) : null}
            {params?.saved === "square_connection" ? (
              <p className="form-success">Square connected successfully.</p>
            ) : null}
            {params?.saved === "test_email" ? (
              <p className="form-success">Test email sent successfully.</p>
            ) : null}
            {params?.saved === "missed_clock_out" ? (
              <p className="form-success">Missed clock-out alert sent successfully.</p>
            ) : null}
            {params?.saved === "square_scan_none" ? (
              <p className="form-success">No open Square timecards met the missed clock-out threshold.</p>
            ) : null}
            {params?.saved === "square_scan_sent" ? (
              <p className="form-success">
                Live Square scan sent {params.count ?? "0"} missed clock-out alert
                {params.count === "1" ? "" : "s"}.
              </p>
            ) : null}
            {params?.error === "schedule_invalid" ? (
              <p className="form-error">Add a valid weekday and time for the schedule entry.</p>
            ) : null}
            {params?.error === "sender_invalid" ? (
              <p className="form-error">
                Choose a sender address with at least 3 letters or numbers. We will add
                `@slpcc63.com` automatically.
              </p>
            ) : null}
            {params?.error === "sender_subscription_missing" ? (
              <p className="form-error">
                An active Time Card Manager subscription is required before you can save a
                sender address.
              </p>
            ) : null}
            {params?.error === "test_email_subscription_missing" ? (
              <p className="form-error">
                Subscribe to the Time Card Manager before sending a test email.
              </p>
            ) : null}
            {params?.error === "test_email_delivery_disabled" ? (
              <p className="form-error">
                Email delivery is disabled by the current notification mode. Switch to
                Email only or Email and text to send a test email.
              </p>
            ) : null}
            {params?.error === "test_email_failed" ? (
              <p className="form-error">
                The test email could not be sent. Double-check the Resend setup and
                sender configuration, then try again.
              </p>
            ) : null}
            {params?.error === "missed_clock_out_invalid" ? (
              <p className="form-error">
                Add an employee name, shift date, and clock-in time before sending a
                missed clock-out alert.
              </p>
            ) : null}
            {params?.error === "missed_clock_out_subscription_missing" ? (
              <p className="form-error">
                Subscribe to the Time Card Manager before sending a missed clock-out alert.
              </p>
            ) : null}
            {params?.error === "missed_clock_out_delivery_disabled" ? (
              <p className="form-error">
                Email delivery is disabled by the current notification mode. Switch to
                Email only or Email and text to send this alert.
              </p>
            ) : null}
            {params?.error === "missed_clock_out_failed" ? (
              <p className="form-error">
                The missed clock-out alert could not be sent. Double-check the email
                setup and try again.
              </p>
            ) : null}
            {params?.error === "square_scan_invalid" ? (
              <p className="form-error">
                Choose a threshold between 1 and 24 hours before scanning Square timecards.
              </p>
            ) : null}
            {params?.error === "square_authorization_failed" ? (
              <p className="form-error">
                Square authorization was canceled or failed before the callback completed.
              </p>
            ) : null}
            {params?.error === "square_state_invalid" ? (
              <p className="form-error">
                Square returned with an invalid state token. Please try the connect flow again.
              </p>
            ) : null}
            {params?.error === "square_token_exchange_failed" ? (
              <p className="form-error">
                Square returned a callback, but the token exchange failed.
              </p>
            ) : null}
            {params?.error === "square_scan_not_connected" ? (
              <p className="form-error">
                Connect Square for this account before scanning live timecards.
              </p>
            ) : null}
            {params?.error === "square_scan_missing_scopes" ? (
              <p className="form-error">
                Your Square connection is missing labor permissions. Reconnect Square after
                requesting {requiredSquareLaborScopes.join(" and ")}.
              </p>
            ) : null}
            {params?.error === "square_scan_send_failed" || params?.error === "square_scan_failed" ? (
              <p className="form-error">
                The live Square scan could not finish. Please try again after checking the
                Square connection and email setup.
              </p>
            ) : null}

            {!overview.entitlement ? (
              <div className="metric">
                <strong>No active subscription</strong>
                Subscribe to the Square Time Card Manager before enabling
                notification automation and texting controls.
                <div className="subscription-actions">
                  <a className="pill primary" href={subscriptionsPath}>
                    View subscription plans
                  </a>
                </div>
              </div>
            ) : (
              <>
                <form action={saveTimeCardManagerSettingsAction} className="auth-form">
                  <input name="redirectTo" type="hidden" value={redirectTo} />
                  <label className="field">
                    <span>Notification delivery</span>
                    <select
                      defaultValue={overview.settings.notificationMode}
                      name="notificationMode"
                    >
                      <option value="email_only">Email only</option>
                      <option value="text_only">
                        Text only
                      </option>
                      <option value="email_and_text">
                        Email and text
                      </option>
                    </select>
                  </label>
                  {!overview.entitlement.textingEnabled ? (
                    <p className="auth-helper">
                      Your current package does not include texting, so any text-capable mode will
                      operate as email only until the subscription is upgraded.
                    </p>
                  ) : null}
                  <label className="checkbox-row">
                    <input
                      defaultChecked={overview.settings.automationEnabled}
                      name="automationEnabled"
                      type="checkbox"
                    />
                    <span>Enable automated runs</span>
                  </label>
                  <button className="pill primary pill-button" type="submit">
                    Save notification settings
                  </button>
                </form>

                <div className="stack-list">
                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Email sender address</h2>
                        <p>
                          Each subscription can claim one sender address on the shared
                          `slpcc63.com` domain.
                        </p>
                      </div>
                      <span className="status-chip">
                        {overview.senderProfile.usesDefaultSender ? "default sender" : "custom sender"}
                      </span>
                    </div>
                    <form action={saveTimeCardManagerSenderAction} className="auth-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <label className="field">
                        <span>Sender address</span>
                        <div className="inline-suffix-field">
                          <input
                            defaultValue={overview.senderProfile.configuredLocalPart ?? ""}
                            name="senderLocalPart"
                            placeholder="spikescoffeeandteas"
                          />
                          <span className="field-suffix">@slpcc63.com</span>
                        </div>
                      </label>
                      <p className="auth-helper">
                        Leave this blank to keep using {overview.senderProfile.defaultFromEmail}.
                      </p>
                      <div className="metric">
                        <strong>Current sender</strong>
                        {overview.senderProfile.fromEmail}
                      </div>
                      <div className="subscription-actions">
                        <button className="pill primary pill-button" type="submit">
                          Save sender address
                        </button>
                      </div>
                    </form>
                    <form action={sendTimeCardManagerTestEmailAction} className="inline-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <button className="pill pill-button" type="submit">
                        Send test email
                      </button>
                    </form>
                    <p className="auth-helper">
                      The test email goes to your account email and uses the same managed
                      sender address the subscription will use for live notifications.
                    </p>
                  </article>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Live Square scan</h2>
                        <p>
                          Pull open timecards directly from Square and send missed clock-out
                          alerts for anyone still clocked in beyond your threshold.
                        </p>
                      </div>
                      <span className="status-chip">
                        {squareStatus.connected && squareStatus.missingScopes.length === 0
                          ? "square ready"
                          : "needs square"}
                      </span>
                    </div>
                    {squareStatus.connected ? (
                      squareStatus.missingScopes.length ? (
                        <>
                          <p className="form-error">
                            Reconnect Square with these scopes before live scanning:
                            {" "}
                            {squareStatus.missingScopes.join(", ")}
                          </p>
                          <div className="subscription-actions">
                            <a className="pill primary" href={squareConnectHref}>
                              Reconnect Square for labor access
                            </a>
                          </div>
                        </>
                      ) : (
                        <p className="auth-helper">
                          Square is connected with the labor scopes needed for live missed
                          clock-out detection.
                        </p>
                      )
                    ) : (
                      <>
                        <p className="form-error">
                          Square is not connected for this account yet.
                        </p>
                        <div className="subscription-actions">
                          <a className="pill primary" href={squareConnectHref}>
                            Connect Square for Time Card Manager
                          </a>
                        </div>
                      </>
                    )}
                    <form action={scanSquareMissedClockOutsAction} className="auth-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <label className="field">
                        <span>Open timecard threshold (hours)</span>
                        <input defaultValue="12" max="24" min="1" name="thresholdHours" type="number" />
                      </label>
                      <button className="pill pill-button" type="submit">
                        Scan Square and send alerts
                      </button>
                    </form>
                  </article>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Missed clock-out alert</h2>
                        <p>
                          Send the first real event-shaped Time Card Manager email using
                          sample shift details.
                        </p>
                      </div>
                      <span className="status-chip">email event</span>
                    </div>
                    <form action={sendTimeCardManagerMissedClockOutEmailAction} className="auth-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <label className="field">
                        <span>Employee name</span>
                        <input defaultValue="Jamie Rivera" name="employeeName" />
                      </label>
                      <label className="field">
                        <span>Shift date</span>
                        <input name="shiftDate" type="date" />
                      </label>
                      <label className="field">
                        <span>Clock-in time</span>
                        <input defaultValue="08:00" name="clockInTime" type="time" />
                      </label>
                      <label className="field">
                        <span>Expected clock-out time</span>
                        <input defaultValue="16:30" name="expectedClockOutTime" type="time" />
                      </label>
                      <label className="field">
                        <span>Location</span>
                        <input defaultValue="Main Cafe" name="locationName" />
                      </label>
                      <button className="pill pill-button" type="submit">
                        Send missed clock-out alert
                      </button>
                    </form>
                    <p className="auth-helper">
                      This still sends to your account email for now, but the content now
                      matches a real Time Card Manager notification event instead of a
                      generic delivery test.
                    </p>
                  </article>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Current package</h2>
                        <p>{overview.entitlement.packageName}</p>
                      </div>
                      <span className="status-chip">
                        {overview.delivery.effectiveMode.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="stat-row compact">
                      <div className="stat">
                        <strong>Configured mode</strong>
                        {overview.delivery.configuredMode.replaceAll("_", " ")}
                      </div>
                      <div className="stat">
                        <strong>Texts used</strong>
                        {overview.currentUsage?.textsSentCount ?? 0}
                      </div>
                      <div className="stat">
                        <strong>Texts remaining</strong>
                        {overview.delivery.textsRemaining}
                      </div>
                      <div className="stat">
                        <strong>Email sender</strong>
                        {overview.senderProfile.fromEmail}
                      </div>
                    </div>
                    <div className="subscription-actions">
                      <a className="pill" href={subscriptionsPath}>
                        Manage subscription
                      </a>
                    </div>
                  </article>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Automation schedule</h2>
                        <p>
                          Choose exactly when the time card manager should run.
                          Each entry represents one automated run per week.
                        </p>
                      </div>
                      <span className="status-chip">
                        {overview.scheduleEntries.length} scheduled
                      </span>
                    </div>
                    <form action={addTimeCardManagerScheduleEntryAction} className="auth-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <label className="field">
                        <span>Day of week</span>
                        <select defaultValue="1" name="dayOfWeek">
                          {weekdayOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Run time</span>
                        <input defaultValue="09:00" name="runTimeLocal" type="time" />
                      </label>
                      <label className="field">
                        <span>Timezone</span>
                        <input defaultValue="America/Los_Angeles" name="timezone" />
                      </label>
                      <button className="pill pill-button" type="submit">
                        Add scheduled run
                      </button>
                    </form>

                    {overview.scheduleEntries.length ? (
                      <div className="stack-list">
                        {overview.scheduleEntries.map((entry) => (
                          <article className="dashboard-subcard" key={entry.id}>
                            <div className="subcard-header">
                              <div>
                                <h2>{labelForDay(entry.dayOfWeek)}</h2>
                                <p>
                                  {entry.runTimeLocal} ({entry.timezone})
                                </p>
                              </div>
                              <form action={removeTimeCardManagerScheduleEntryAction}>
                                <input name="redirectTo" type="hidden" value={redirectTo} />
                                <input name="scheduleEntryId" type="hidden" value={entry.id} />
                                <button className="pill pill-button" type="submit">
                                  Remove
                                </button>
                              </form>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="auth-helper">
                        No schedule entries yet. Add one or more explicit weekly runs to control
                        how often automated notifications go out.
                      </p>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>

          <aside className="dashboard-card">
            <h2>How limits work</h2>
            <ul className="checklist compact-list">
              <li>Manual and automated text sends both count against the monthly quota.</li>
              <li>Email remains available even when texting is disabled or capped.</li>
              <li>Text quotas do not roll over into the next billing period.</li>
            </ul>
            <div className="metric">
              <strong>Next run</strong>
              {overview.nextRunLabel ?? "Automation is currently off or unscheduled"}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
