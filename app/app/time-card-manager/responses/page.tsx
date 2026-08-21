import {
  reviewTimeCardConfirmationRequestAction,
  resendTimeCardConfirmationRequestAction,
  saveTimeCardConfirmationSettingsAction,
  saveTimeCardEmployeeContactAction,
  sendTimeCardConfirmationRequestAction,
  syncTimeCardEmployeesAction
} from "@/app/app/actions";
import { ConfirmFormSubmit } from "@/components/confirm-form-submit";
import { SiteHeader } from "@/components/site-header";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { isTimeCardManagerAutomationLive } from "@/lib/square-time-card-manager";
import { getActiveSubscriptionForProduct } from "@/lib/subscriptions";
import { buildDefaultManualConfirmationPeriod } from "@/lib/time-card-confirmation-schedule";
import {
  getTimeCardConfirmationAuditEvents,
  getTimeCardConfirmationRuns,
  getOrCreateTimeCardConfirmationSettings,
  getTimeCardConfirmationRequests,
  getTimeCardEmployeeContacts
} from "@/lib/time-card-email-workflow";
import {
  filterTimeCardConfirmationRequests,
  isTimeCardRequestOverdue
} from "@/lib/time-card-report";

const weekdayOptions = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

type ManagerResponsesPageProps = {
  searchParams?: Promise<{
    count?: string;
    employee?: string;
    error?: string;
    periodEnd?: string;
    periodStart?: string;
    saved?: string;
    status?: string;
  }>;
};

function formatScheduleTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

export default async function ManagerResponsesPage({
  searchParams
}: ManagerResponsesPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost
    ? "/time-card-manager/responses"
    : "/app/time-card-manager/responses";
  const timeCardPath = routing.appHost ? "/time-card-manager" : "/app/time-card-manager";
  const subscriptionsPath = routing.appHost ? "/subscriptions" : "/app/subscriptions";
  const { customer } = await requireCurrentCustomer(redirectTo, routing.dashboardPath);
  const [employees, requests, auditEvents, confirmationRuns, confirmationSettings, subscription, query] = await Promise.all([
    getTimeCardEmployeeContacts(customer.id),
    getTimeCardConfirmationRequests(customer.id, 250),
    getTimeCardConfirmationAuditEvents(customer.id),
    getTimeCardConfirmationRuns(customer.id),
    getOrCreateTimeCardConfirmationSettings(customer.id),
    getActiveSubscriptionForProduct({
      customerId: customer.id,
      productSlug: "square-time-card-manager"
    }),
    searchParams
  ]);
  const automationLive = isTimeCardManagerAutomationLive();
  const now = new Date();
  const defaultPeriod = buildDefaultManualConfirmationPeriod(now, confirmationSettings.timezone);
  const filters = {
    employee: query?.employee,
    periodEnd: query?.periodEnd,
    periodStart: query?.periodStart,
    status: query?.status
  };
  const filteredRequests = filterTimeCardConfirmationRequests(requests, filters, now);
  const awaitingReview = filteredRequests.filter((request) => request.status === "responded");
  const openRequests = filteredRequests.filter((request) =>
    request.status === "pending" || request.status === "delivery_failed"
  );
  const completedRequests = filteredRequests.filter((request) =>
    request.status === "approved" || request.status === "rejected"
  );
  const overdueCount = requests.filter((request) => isTimeCardRequestOverdue(request, now)).length;
  const emailReadyCount = employees.filter((employee) => employee.active && employee.email).length;
  const exportParams = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value) exportParams.set(key, value);
  });

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Time Card Manager</div>
        <div className="section-heading">
          <div>
            <h1>Employee confirmations</h1>
            <p>Manage employee email contacts, send requests, and review every response.</p>
          </div>
          <a className="pill" href={timeCardPath}>Back to alerts</a>
        </div>

        {query?.saved === "employees_synced" ? (
          <p className="form-success">Synced {query.count ?? "0"} active Square employees.</p>
        ) : null}
        {query?.saved === "employee_contact" ? (
          <p className="form-success">Employee email settings saved.</p>
        ) : null}
        {query?.saved === "confirmation_sent" ? (
          <p className="form-success">Confirmation request sent by email.</p>
        ) : null}
        {query?.saved === "confirmation_resent" ? (
          <p className="form-success">A new secure response link was emailed to the employee.</p>
        ) : null}
        {query?.saved === "confirmation_settings" ? (
          <p className="form-success">Weekly confirmation schedule saved.</p>
        ) : null}
        {query?.saved === "approved" ? (
          <p className="form-success">Response approved and added to the audit record.</p>
        ) : null}
        {query?.saved === "rejected" ? (
          <p className="form-success">Response rejected and added to the audit record.</p>
        ) : null}
        {query?.error?.startsWith("employee_sync") ? (
          <p className="form-error">Square employees could not be synced. Reconnect Square with employee access and try again.</p>
        ) : null}
        {query?.error === "employee_contact_invalid" ? (
          <p className="form-error">Enter a valid employee email address and timezone.</p>
        ) : null}
        {query?.error === "confirmation_subscription_missing" ? (
          <p className="form-error">An active Time Card Manager subscription is required.</p>
        ) : null}
        {query?.error === "confirmation_employee_email_missing" ? (
          <p className="form-error">Save a valid email for that employee before sending.</p>
        ) : null}
        {query?.error === "confirmation_period_invalid" ? (
          <p className="form-error">Choose a valid confirmation period.</p>
        ) : null}
        {query?.error === "confirmation_duplicate" ? (
          <p className="form-error">A request already exists for that employee and period.</p>
        ) : null}
        {query?.error === "confirmation_send_failed" ? (
          <p className="form-error">The request could not be sent. Check the email provider configuration.</p>
        ) : null}
        {query?.error === "confirmation_resend_failed" ? (
          <p className="form-error">The reminder could not be sent, or the request is no longer open.</p>
        ) : null}
        {query?.error === "confirmation_settings_invalid" ? (
          <p className="form-error">Choose a valid weekly schedule, timezone, and period length.</p>
        ) : null}
        {query?.error === "review_invalid" ? (
          <p className="form-error">That response is no longer awaiting review or contains invalid shift details.</p>
        ) : null}

        {!subscription ? (
          <div className="dashboard-alert warning">
            <strong>Setup mode — subscription required for sending</strong>
            <p>
              You can review history, maintain the Square roster, and export reports.
              Sending confirmations, reminders, and weekly automation remain locked until
              a Time Card Manager subscription is active.
            </p>
            <a className="pill primary" href={subscriptionsPath}>View subscription plans</a>
          </div>
        ) : null}

        <details className="dashboard-card workflow-disclosure confirmation-report-card">
          <summary>
            <span>
              <strong>Reports and filters</strong>
              <small>{requests.length} total · {overdueCount} overdue</small>
            </span>
            <span className="status-chip">{filteredRequests.length} matching</span>
          </summary>
          <div className="workflow-disclosure-content">
          <div className="subcard-header">
            <div>
              <h2>Confirmation report</h2>
              <p>Filter the manager record or download the same results as a spreadsheet-ready CSV.</p>
            </div>
            <a
              className="pill"
              href={`/api/time-card-manager/export${exportParams.size ? `?${exportParams.toString()}` : ""}`}
            >
              Download CSV
            </a>
          </div>
          <div className="form-grid-three">
            <div className="metric">
              <strong>{requests.length}</strong>
              Total requests
            </div>
            <div className="metric">
              <strong>{requests.filter((request) => request.status === "responded").length}</strong>
              Awaiting review
            </div>
            <div className="metric">
              <strong>{overdueCount}</strong>
              Overdue
            </div>
          </div>
          <form className="auth-form" method="get">
            <div className="form-grid-three">
              <label className="field">
                <span>Employee</span>
                <input defaultValue={query?.employee ?? ""} name="employee" placeholder="Search by name" />
              </label>
              <label className="field">
                <span>Status</span>
                <select defaultValue={query?.status ?? ""} name="status">
                  <option value="">All statuses</option>
                  <option value="responded">Awaiting review</option>
                  <option value="pending">Waiting for employee</option>
                  <option value="overdue">Overdue</option>
                  <option value="delivery_failed">Delivery failed</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <div className="field">
                <span>Results</span>
                <strong>{filteredRequests.length} matching</strong>
              </div>
            </div>
            <div className="form-grid-two">
              <label className="field">
                <span>Period on or after</span>
                <input defaultValue={query?.periodStart ?? ""} name="periodStart" type="date" />
              </label>
              <label className="field">
                <span>Period on or before</span>
                <input defaultValue={query?.periodEnd ?? ""} name="periodEnd" type="date" />
              </label>
            </div>
            <div className="subscription-actions">
              <button className="pill primary pill-button" type="submit">Apply filters</button>
              <a className="pill" href={redirectTo}>Clear</a>
            </div>
          </form>
          </div>
        </details>

        <div className="manager-workflow-grid">
          <section className="dashboard-card manager-workflow-main">
            <div className="subcard-header">
              <div>
                <h2>Review inbox</h2>
                <p>Employee submissions remain pending until a manager approves or rejects them.</p>
              </div>
              <span className="status-chip">{awaitingReview.length} awaiting review</span>
            </div>

            {awaitingReview.length ? (
              <div className="stack-list">
                {awaitingReview.map((request) => (
                  <article className="dashboard-subcard" key={request.id}>
                    <div className="subcard-header">
                      <div>
                        <h2>{request.employeeName}</h2>
                        <p>{request.periodStart} through {request.periodEnd}</p>
                      </div>
                      <span className="status-chip">
                        {request.responseCode === "a" ? "Did not work" : "Worked"}
                      </span>
                    </div>
                    <div className="metric">
                      <strong>Employee report</strong>
                      {request.responseCode === "a"
                        ? "Did not work"
                        : `${request.reportedShiftDate}: ${request.reportedTimeIn}–${request.reportedTimeOut}`}
                      {request.responseNote ? <p>Note: {request.responseNote}</p> : null}
                    </div>
                    <form action={reviewTimeCardConfirmationRequestAction} className="auth-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <input name="requestId" type="hidden" value={request.id} />
                      {request.responseCode === "b" ? (
                        <div className="form-grid-three">
                          <label className="field">
                            <span>Approved shift date</span>
                            <input defaultValue={request.reportedShiftDate ?? ""} name="shiftDate" type="date" />
                          </label>
                          <label className="field">
                            <span>Approved time in</span>
                            <input defaultValue={request.reportedTimeIn ?? ""} name="timeIn" type="time" />
                          </label>
                          <label className="field">
                            <span>Approved time out</span>
                            <input defaultValue={request.reportedTimeOut ?? ""} name="timeOut" type="time" />
                          </label>
                        </div>
                      ) : null}
                      <label className="field">
                        <span>Manager note</span>
                        <textarea maxLength={2000} name="managerNote" rows={3} />
                      </label>
                      <div className="subscription-actions">
                        <button className="pill primary pill-button" name="decision" type="submit" value="approved">
                          Approve
                        </button>
                        <button className="pill pill-button" name="decision" type="submit" value="rejected">
                          Reject
                        </button>
                      </div>
                    </form>
                  </article>
                ))}
              </div>
            ) : (
              <p className="auth-helper">No employee responses are waiting for review.</p>
            )}

            <div className="section-heading">
              <div>
                <h2>Open requests</h2>
                <p>Requests that are waiting for a response or encountered a delivery failure.</p>
              </div>
              <span className="status-chip">{openRequests.length} open</span>
            </div>
            {openRequests.length ? (
              <div className="delivery-log">
                {openRequests.map((request) => (
                  <article className="delivery-log-row" key={request.id}>
                    <div className="delivery-log-topline">
                      <strong>{request.employeeName}</strong>
                      <span className={`delivery-log-status ${request.status === "delivery_failed" || isTimeCardRequestOverdue(request, now) ? "failed" : "sent"}`}>
                        {isTimeCardRequestOverdue(request, now)
                          ? "overdue"
                          : request.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p>{request.periodStart} through {request.periodEnd} · {request.employeeEmail}</p>
                    <p className="delivery-log-time">
                      {request.sentAt ? `Sent ${request.sentAt.toLocaleString()}` : "Not delivered"}
                      {request.reminderCount ? ` · ${request.reminderCount} reminder${request.reminderCount === 1 ? "" : "s"}` : ""}
                    </p>
                    <form action={resendTimeCardConfirmationRequestAction}>
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <input name="requestId" type="hidden" value={request.id} />
                      {subscription ? (
                        <ConfirmFormSubmit
                          action="resend_confirmation"
                          buttonClassName="pill pill-button"
                          buttonLabel={request.status === "delivery_failed" ? "Retry email" : "Send reminder"}
                          confirmLabel={request.status === "delivery_failed" ? "Retry email now" : "Send reminder now"}
                          employeeEmail={request.employeeEmail}
                          employeeName={request.employeeName}
                          periodEnd={request.periodEnd}
                          periodStart={request.periodStart}
                        />
                      ) : (
                        <a className="pill" href={subscriptionsPath}>Subscription required</a>
                      )}
                    </form>
                  </article>
                ))}
              </div>
            ) : <p className="auth-helper">No open requests.</p>}

            <details className="workflow-disclosure workflow-history">
              <summary>
                <span>
                  <strong>Decision history and audit</strong>
                  <small>{completedRequests.length} decisions · {auditEvents.length} audit events</small>
                </span>
              </summary>
              <div className="workflow-disclosure-content">
            <div className="section-heading">
              <div>
                <h2>Decision history</h2>
                <p>Recent approved and rejected responses.</p>
              </div>
            </div>
            {completedRequests.length ? (
              <div className="delivery-log">
                {completedRequests.map((request) => (
                  <article className="delivery-log-row" key={request.id}>
                    <div className="delivery-log-topline">
                      <strong>{request.employeeName}</strong>
                      <span className={`delivery-log-status ${request.status === "approved" ? "sent" : "blocked"}`}>
                        {request.status}
                      </span>
                    </div>
                    <p>
                      {request.responseCode === "a"
                        ? "Did not work"
                        : `${request.reportedShiftDate}: ${request.reportedTimeIn}–${request.reportedTimeOut}`}
                    </p>
                    <p className="delivery-log-time">
                      Period {request.periodStart} through {request.periodEnd}
                      {request.reviewedAt ? ` · Reviewed ${request.reviewedAt.toLocaleString()}` : ""}
                    </p>
                    {request.managerNote ? <p>Manager note: {request.managerNote}</p> : null}
                  </article>
                ))}
              </div>
            ) : <p className="auth-helper">No completed reviews yet.</p>}

            <div className="section-heading">
              <div>
                <h2>Audit trail</h2>
                <p>Immutable request, delivery, response, and manager decision events.</p>
              </div>
              <span className="status-chip">{auditEvents.length} recent</span>
            </div>
            {auditEvents.length ? (
              <div className="delivery-log">
                {auditEvents.map((event) => (
                  <article className="delivery-log-row" key={event.id}>
                    <div className="delivery-log-topline">
                      <strong>{event.employeeName}</strong>
                      <span className="delivery-log-channel">{event.actorType}</span>
                      <span className="status-chip">{event.eventType.replaceAll("_", " ")}</span>
                    </div>
                    <p className="delivery-log-time">{event.createdAt.toLocaleString()}</p>
                  </article>
                ))}
              </div>
            ) : <p className="auth-helper">No audit events yet.</p>}
              </div>
            </details>
          </section>

          <aside className="manager-operations">
            <details className="dashboard-card workflow-disclosure operations-disclosure">
              <summary>
                <span>
                  <strong>Weekly automation</strong>
                  <small>
                    {weekdayOptions[confirmationSettings.sendDayOfWeek]} at {formatScheduleTime(confirmationSettings.sendTimeLocal)}
                    {` · manager summary ${formatScheduleTime(confirmationSettings.managerReminderTimeLocal)} · ${emailReadyCount} email-ready`}
                  </small>
                </span>
                <span className="status-chip">
                  {!subscription
                    ? "locked"
                    : confirmationSettings.automationEnabled && automationLive
                      ? "enabled"
                      : "off"}
                </span>
              </summary>
              <div className="workflow-disclosure-content">
            <div className="subcard-header">
              <div>
                <h2>Weekly email schedule</h2>
                <p>Automatically request confirmation for the completed period ending yesterday.</p>
              </div>
              <span className="status-chip">
                {!subscription
                  ? "subscription required"
                  : confirmationSettings.automationEnabled && automationLive
                    ? "enabled"
                    : "off"}
              </span>
            </div>
            <form action={saveTimeCardConfirmationSettingsAction} className="auth-form">
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label className="checkbox-row">
                <input
                  defaultChecked={confirmationSettings.automationEnabled}
                  disabled={!automationLive || !subscription}
                  name="automationEnabled"
                  type="checkbox"
                />
                <span>Send employee confirmations automatically</span>
              </label>
              <div className="form-grid-two">
                <label className="field">
                  <span>Send day</span>
                  <select disabled={!subscription} defaultValue={confirmationSettings.sendDayOfWeek} name="sendDayOfWeek">
                    {weekdayOptions.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Send time</span>
                  <input disabled={!subscription} defaultValue={confirmationSettings.sendTimeLocal} name="sendTimeLocal" type="time" />
                </label>
              </div>
              <label className="field">
                <span>Schedule timezone</span>
                <select disabled={!subscription} defaultValue={confirmationSettings.timezone} name="timezone">
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/New_York">Eastern Time</option>
                </select>
              </label>
              <label className="field">
                <span>Days in each confirmation period</span>
                <input disabled={!subscription} defaultValue={confirmationSettings.periodDays} max="31" min="1" name="periodDays" type="number" />
              </label>
              <label className="checkbox-row">
                <input
                  defaultChecked={confirmationSettings.managerReminderEnabled}
                  disabled={!automationLive || !subscription}
                  name="managerReminderEnabled"
                  type="checkbox"
                />
                <span>Email the manager a list of employees who have not responded</span>
              </label>
              <label className="field">
                <span>Manager summary time</span>
                <input
                  disabled={!subscription}
                  defaultValue={confirmationSettings.managerReminderTimeLocal}
                  name="managerReminderTimeLocal"
                  type="time"
                />
              </label>
              <p className="auth-helper">
                The manager summary runs on the same weekday as the employee email schedule.
              </p>
              {!subscription ? (
                <p className="auth-helper">Activate a subscription before weekly sending can be enabled.</p>
              ) : null}
              {!automationLive ? (
                <p className="auth-helper">Weekly automation is temporarily unavailable.</p>
              ) : null}
              {subscription ? (
                <ConfirmFormSubmit
                  action="save_schedule"
                  buttonClassName="pill pill-button"
                  buttonLabel="Save weekly schedule"
                  confirmLabel="Enable weekly emails"
                  employeeCount={emailReadyCount}
                />
              ) : (
                <a className="pill primary" href={subscriptionsPath}>View subscription plans</a>
              )}
            </form>

            <div className="section-heading">
              <div>
                <h2>Automation runs</h2>
                <p>Each employee period is claimed once, preventing duplicate weekly sends.</p>
              </div>
            </div>
            {confirmationRuns.length ? (
              <div className="delivery-log">
                {confirmationRuns.map((run) => (
                  <article className="delivery-log-row" key={run.id}>
                    <div className="delivery-log-topline">
                      <strong>{run.periodStart} through {run.periodEnd}</strong>
                      <span className={`delivery-log-status ${run.failedCount ? "failed" : "sent"}`}>
                        {run.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p>{run.sentCount} sent · {run.skippedCount} skipped · {run.failedCount} failed</p>
                    <p className="delivery-log-time">
                      Started {run.createdAt.toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="auth-helper">No automated confirmation run has occurred yet.</p>
            )}
              </div>
            </details>

            <details className="dashboard-card workflow-disclosure operations-disclosure">
              <summary>
                <span>
                  <strong>Employee email roster</strong>
                  <small>{employees.filter((employee) => employee.active).length} active · {emailReadyCount} email-ready</small>
                </span>
              </summary>
              <div className="workflow-disclosure-content">
            <div className="section-heading">
              <div>
                <h2>Employee email roster</h2>
                <p>Sync names from Square, then add the email used for confirmations.</p>
              </div>
            </div>
            <div className="subcard-header">
              <div>
                <h2>Square employees</h2>
                <p>Only active employees with saved email addresses receive scheduled requests.</p>
              </div>
              <span className="status-chip">{employees.filter((employee) => employee.active).length} active</span>
            </div>
            <form action={syncTimeCardEmployeesAction}>
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <button className="pill primary pill-button" type="submit">Sync from Square</button>
            </form>

            <div className="stack-list">
              {employees.map((employee) => (
                <article className="dashboard-subcard" key={employee.id}>
                  <div className="subcard-header">
                    <div>
                      <h2>{employee.displayName}</h2>
                      <p>{employee.active ? "Active in Square" : "No longer active in Square"}</p>
                    </div>
                    <span className="status-chip">{employee.email ? "email ready" : "needs email"}</span>
                  </div>
                  <form action={saveTimeCardEmployeeContactAction} className="auth-form">
                    <input name="redirectTo" type="hidden" value={redirectTo} />
                    <input name="employeeId" type="hidden" value={employee.id} />
                    <label className="field">
                      <span>Email</span>
                      <input defaultValue={employee.email ?? ""} name="email" type="email" />
                    </label>
                    <label className="field">
                      <span>Timezone</span>
                      <input defaultValue={employee.timezone} name="timezone" />
                    </label>
                    <button className="pill pill-button" type="submit">Save contact</button>
                  </form>

                  {employee.active && employee.email ? (
                    <form action={sendTimeCardConfirmationRequestAction} className="auth-form confirmation-send-form">
                      <input name="redirectTo" type="hidden" value={redirectTo} />
                      <input name="employeeId" type="hidden" value={employee.id} />
                      <div className="form-grid-two">
                        <label className="field">
                          <span>Period start</span>
                          <input defaultValue={defaultPeriod.periodStart} name="periodStart" type="date" />
                        </label>
                        <label className="field">
                          <span>Period end</span>
                          <input defaultValue={defaultPeriod.periodEnd} name="periodEnd" type="date" />
                        </label>
                      </div>
                      {subscription ? (
                        <ConfirmFormSubmit
                          action="send_confirmation"
                          buttonLabel="Send confirmation email"
                          confirmLabel="Send email now"
                          employeeEmail={employee.email}
                          employeeName={employee.displayName}
                          periodEnd={defaultPeriod.periodEnd}
                          periodStart={defaultPeriod.periodStart}
                        />
                      ) : (
                        <a className="pill" href={subscriptionsPath}>Subscription required to send</a>
                      )}
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
            {!employees.length ? (
              <p className="auth-helper">Sync Square employees to create the confirmation roster.</p>
            ) : null}
              </div>
            </details>
          </aside>
        </div>
      </main>
    </>
  );
}
