import { SiteHeader } from "@/components/site-header";
import {
  addTimeCardManagerScheduleEntryAction,
  removeTimeCardManagerScheduleEntryAction,
  scanSquareMissedClockOutsAction,
  sendTimeCardManagerMissedClockOutEmailAction,
  sendTimeCardManagerTestEmailAction,
  sendTimeCardManagerTestTextAction,
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

function labelForDeliveryEvent(eventType: string) {
  return eventType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  const accountPath = routing.appHost ? "/account" : "/app/account";
  const squareConnectHref = `/api/integrations/square/connect?plugin=square-time-card-manager`;
  const { customer } = await requireCurrentCustomer(redirectTo, "/app");
  await ensureSeedCatalog();
  const [overview, squareStatus] = await Promise.all([
    getTimeCardManagerOverview(customer.id),
    getTimeCardManagerSquareStatus(customer.id)
  ]);
  const params = await searchParams;
  const squareReady = squareStatus.connected && squareStatus.missingScopes.length === 0;
  const hasPhone = Boolean(customer.phone?.trim());
  const scheduleReady = overview.scheduleEntries.length > 0;
  const setupSteps = [
    {
      label: "Subscription",
      value: overview.entitlement ? "Active" : "Needed",
      done: Boolean(overview.entitlement)
    },
    {
      label: "Square access",
      value: squareReady ? "Ready" : squareStatus.connected ? "Reconnect" : "Connect",
      done: squareReady
    },
    {
      label: "Phone",
      value: hasPhone ? "Saved" : "Add phone",
      done: hasPhone
    },
    {
      label: "Schedule",
      value: scheduleReady ? "Set" : "Not set",
      done: scheduleReady
    }
  ];
  const smsStatus = overview.textingLive
    ? overview.entitlement?.textingEnabled
      ? "Texting available"
      : "Plan does not include texting"
    : "Texting pending provider approval";
  const deliveryModeLabel = overview.textingLive
    ? overview.delivery.effectiveMode.replaceAll("_", " ")
    : "email only";

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Square Time Card Manager</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Time card notifications</h1>
            <p>
              Manage how missed clock-out alerts are sent, test delivery, and
              schedule automatic Square scans.
            </p>

            <div className="setup-grid">
              {setupSteps.map((step) => (
                <div className="setup-step" key={step.label}>
                  <span className="status-chip">{step.done ? "done" : "todo"}</span>
                  <strong>{step.label}</strong>
                  <p>{step.value}</p>
                </div>
              ))}
            </div>

            <div className="stat-row compact">
              <div className="stat">
                <strong>Delivery mode</strong>
                {deliveryModeLabel}
              </div>
              <div className="stat">
                <strong>Texts remaining</strong>
                {overview.delivery.textsRemaining}
              </div>
              <div className="stat">
                <strong>Next run</strong>
                {overview.nextRunLabel ?? "Not scheduled"}
              </div>
            </div>

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
            {params?.saved === "settings_manual_only" ? (
              <p className="form-success">
                Email settings saved. Automated runs will stay off until cron is
                enabled in the deployment environment.
              </p>
            ) : null}
            {params?.saved === "settings_sms_pending" ? (
              <p className="form-success">
                Notification settings saved. Text-capable modes will stay disabled until
                the SMS provider env vars are configured in the deployment.
              </p>
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
            {params?.saved === "test_text" ? (
              <p className="form-success">Test text sent successfully.</p>
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
            {params?.error === "test_text_subscription_missing" ? (
              <p className="form-error">
                Subscribe to the Time Card Manager before sending a test text.
              </p>
            ) : null}
            {params?.error === "test_text_delivery_disabled" ? (
              <p className="form-error">
                Text delivery is disabled by the current notification mode. Switch to
                Text only or Email and text to send a test text.
              </p>
            ) : null}
            {params?.error === "test_text_phone_missing" ? (
              <p className="form-error">
                Add a valid phone number on your Account page before sending test texts.
              </p>
            ) : null}
            {params?.error === "test_text_failed" ? (
              <p className="form-error">
                The test text could not be sent. Double-check the SMS provider setup,
                your phone number, and any pending Twilio Trust Hub or A2P review.
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
                The missed clock-out alert could not be sent. Double-check the
                notification setup and try again.
              </p>
            ) : null}
            {params?.error === "missed_clock_out_phone_missing" ? (
              <p className="form-error">
                Add a valid phone number on your Account page before sending text-based
                missed clock-out alerts.
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
                Choose a Time Card Manager plan before enabling notification
                delivery, Square scans, or automation.
                <div className="subscription-actions">
                  <a className="pill primary" href={subscriptionsPath}>
                    View subscription plans
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="section-heading">
                  <div>
                    <h2>Delivery preferences</h2>
                    <p>Choose the channels this subscription should use for alerts.</p>
                  </div>
                  <span className="status-chip">{smsStatus}</span>
                </div>
                <form action={saveTimeCardManagerSettingsAction} className="auth-form">
                  <input name="redirectTo" type="hidden" value={redirectTo} />
                  <label className="field">
                    <span>Notification delivery</span>
                    <select
                      defaultValue={overview.settings.notificationMode}
                      name="notificationMode"
                    >
                      <option value="email_only">Email only</option>
                      <option disabled={!overview.textingLive} value="text_only">
                        Text only{!overview.textingLive ? " (texting not available yet)" : ""}
                      </option>
                      <option disabled={!overview.textingLive} value="email_and_text">
                        Email and text{!overview.textingLive ? " (texting not available yet)" : ""}
                      </option>
                    </select>
                  </label>
                  {!overview.textingLive ? (
                    <p className="auth-helper">
                      Texting is temporarily unavailable while Twilio carrier approval is
                      pending. Email delivery and automation remain available.
                    </p>
                  ) : !overview.entitlement.textingEnabled ? (
                    <p className="auth-helper">
                      Your current package does not include texting, so any text-capable mode will
                      operate as email only until the subscription is upgraded.
                    </p>
                  ) : null}
                  <label className="checkbox-row">
                    <input
                      defaultChecked={overview.settings.automationEnabled}
                      disabled={!overview.automationLive}
                      name="automationEnabled"
                      type="checkbox"
                    />
                    <span>
                      Enable automated runs
                    </span>
                  </label>
                  {!overview.automationLive ? (
                    <p className="auth-helper">
                      Automated runs are temporarily paused until the production cron
                      configuration is available again.
                    </p>
                  ) : null}
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
                          Set the `@slpcc63.com` address customers see when
                          email alerts arrive.
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
                    <form action={sendTimeCardManagerTestTextAction} className="inline-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <button className="pill pill-button" type="submit">
                        Send test text
                      </button>
                    </form>
                    <p className="auth-helper">
                      Test email goes to your account email. Test text goes to the phone
                      number saved on your Account page.
                    </p>
                  </article>

                  {!hasPhone ? (
                    <article className="dashboard-subcard">
                      <div className="subcard-header">
                        <div>
                          <h2>Add a phone number</h2>
                          <p>Text tests and text alerts need a valid account phone number.</p>
                        </div>
                        <span className="status-chip">needed</span>
                      </div>
                      <div className="subscription-actions">
                        <a className="pill primary" href={accountPath}>
                          Update account
                        </a>
                      </div>
                    </article>
                  ) : null}

                  <div className="section-heading">
                    <div>
                      <h2>Square data</h2>
                      <p>Connect Square and scan open timecards when you need an immediate check.</p>
                    </div>
                    <span className="status-chip">{squareReady ? "ready" : "setup needed"}</span>
                  </div>

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

                  <div className="section-heading">
                    <div>
                      <h2>Test alert</h2>
                      <p>Send one sample notification through the current delivery settings.</p>
                    </div>
                    <span className="status-chip">manual test</span>
                  </div>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Missed clock-out alert</h2>
                        <p>
                          Send a real missed clock-out notification using sample shift
                          details and your current delivery mode.
                        </p>
                      </div>
                      <span className="status-chip">live event</span>
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
                      Email goes to your account email and text goes to your saved account
                      phone number, following the current notification mode and text quota.
                    </p>
                  </article>

                  <div className="section-heading">
                    <div>
                      <h2>Plan and usage</h2>
                      <p>Review the current package and monthly text allowance.</p>
                    </div>
                  </div>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Current package</h2>
                        <p>{overview.entitlement.packageName}</p>
                      </div>
                      <span className="status-chip">
                        {overview.textingLive
                          ? overview.delivery.effectiveMode.replaceAll("_", " ")
                          : "email live"}
                      </span>
                    </div>
                    <div className="stat-row compact">
                      <div className="stat">
                        <strong>Configured mode</strong>
                        {overview.textingLive
                          ? overview.delivery.configuredMode.replaceAll("_", " ")
                          : "email only"}
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

                  <div className="section-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>See the latest delivery attempts and provider responses.</p>
                    </div>
                  </div>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Recent delivery activity</h2>
                        <p>
                          Track whether notifications were sent, blocked, or failed while
                          email and SMS setup evolves.
                        </p>
                      </div>
                      <span className="status-chip">
                        {overview.recentDeliveries.length} recent
                      </span>
                    </div>
                    {overview.recentDeliveries.length ? (
                      <div className="delivery-log" role="list">
                        {overview.recentDeliveries.map((entry) => (
                          <article className="delivery-log-row" key={entry.id} role="listitem">
                            <div className="delivery-log-main">
                              <div className="delivery-log-topline">
                                <span className="delivery-log-channel">
                                  {entry.channel === "text" ? "Text" : "Email"}
                                </span>
                                <strong>{labelForDeliveryEvent(entry.eventType)}</strong>
                                <span className={`delivery-log-status ${entry.status}`}>
                                  {entry.status}
                                </span>
                              </div>
                              <p className="delivery-log-recipient">Sent to {entry.recipient}</p>
                              <p className="delivery-log-time">
                                {entry.createdAt.toLocaleString()}
                              </p>
                            </div>
                            {entry.errorMessage ? (
                              <p
                                className={`delivery-log-detail ${
                                  entry.status === "failed" ? "delivery-log-detail-error" : ""
                                }`}
                              >
                                {entry.errorMessage}
                              </p>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="auth-helper">
                        No delivery attempts yet. Send a test email or test text to start
                        building delivery history.
                      </p>
                    )}
                  </article>

                  <div className="section-heading">
                    <div>
                      <h2>Automation schedule</h2>
                      <p>Choose the weekly windows for automatic Square scans.</p>
                    </div>
                    <span className="status-chip">
                      {overview.scheduleEntries.length} scheduled
                    </span>
                  </div>

                  <article className="dashboard-subcard">
                    <div className="subcard-header">
                      <div>
                        <h2>Automation schedule</h2>
                        <p>
                          Choose exactly when the time card manager should run.
                          Each saved entry becomes one weekly automation window.
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
                        No schedule entries yet. Add one or more weekly runs to tell the
                        automation job when to scan Square.
                      </p>
                    )}
                  </article>
                </div>
              </>
            )}
          </section>

          <aside className="dashboard-card">
            <h2>Phase 1 status</h2>
            <ul className="checklist compact-list">
              <li>Email delivery is live today.</li>
              <li>SMS delivery is wired in the app and waiting on Twilio carrier approval.</li>
              <li>
                Automation runs are wired through the protected cron route and GitHub Actions
                scheduler.
              </li>
            </ul>
            <div className="metric">
              <strong>Next run</strong>
              {overview.nextRunLabel ?? "No automated run scheduled yet"}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
