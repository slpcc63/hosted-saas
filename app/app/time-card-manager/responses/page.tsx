import {
  reviewTimeCardConfirmationRequestAction,
  saveTimeCardConfirmationSettingsAction,
  saveTimeCardEmployeeContactAction,
  sendTimeCardConfirmationRequestAction,
  syncTimeCardEmployeesAction
} from "@/app/app/actions";
import { SiteHeader } from "@/components/site-header";
import { requireCurrentCustomer } from "@/lib/customers";
import { getPublicRouting } from "@/lib/request-routing";
import { isTimeCardManagerAutomationLive } from "@/lib/square-time-card-manager";
import {
  getTimeCardConfirmationAuditEvents,
  getOrCreateTimeCardConfirmationSettings,
  getTimeCardConfirmationRequests,
  getTimeCardEmployeeContacts
} from "@/lib/time-card-email-workflow";

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
    error?: string;
    saved?: string;
  }>;
};

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { periodEnd: formatDateInput(end), periodStart: formatDateInput(start) };
}

export default async function ManagerResponsesPage({
  searchParams
}: ManagerResponsesPageProps) {
  const routing = await getPublicRouting();
  const redirectTo = routing.appHost
    ? "/time-card-manager/responses"
    : "/app/time-card-manager/responses";
  const timeCardPath = routing.appHost ? "/time-card-manager" : "/app/time-card-manager";
  const { customer } = await requireCurrentCustomer(redirectTo, routing.dashboardPath);
  const [employees, requests, auditEvents, confirmationSettings, query] = await Promise.all([
    getTimeCardEmployeeContacts(customer.id),
    getTimeCardConfirmationRequests(customer.id),
    getTimeCardConfirmationAuditEvents(customer.id),
    getOrCreateTimeCardConfirmationSettings(customer.id),
    searchParams
  ]);
  const automationLive = isTimeCardManagerAutomationLive();
  const defaultPeriod = getDefaultPeriod();
  const awaitingReview = requests.filter((request) => request.status === "responded");
  const openRequests = requests.filter((request) =>
    request.status === "pending" || request.status === "delivery_failed"
  );
  const completedRequests = requests.filter((request) =>
    request.status === "approved" || request.status === "rejected"
  );

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
        {query?.error === "confirmation_settings_invalid" ? (
          <p className="form-error">Choose a valid weekly schedule, timezone, and period length.</p>
        ) : null}
        {query?.error === "review_invalid" ? (
          <p className="form-error">That response is no longer awaiting review or contains invalid shift details.</p>
        ) : null}

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
                      <span className={`delivery-log-status ${request.status === "delivery_failed" ? "failed" : "sent"}`}>
                        {request.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p>{request.periodStart} through {request.periodEnd} · {request.employeeEmail}</p>
                    <p className="delivery-log-time">
                      {request.sentAt ? `Sent ${request.sentAt.toLocaleString()}` : "Not delivered"}
                    </p>
                  </article>
                ))}
              </div>
            ) : <p className="auth-helper">No open requests.</p>}

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
          </section>

          <aside className="dashboard-card">
            <div className="subcard-header">
              <div>
                <h2>Weekly email schedule</h2>
                <p>Automatically request confirmation for the completed period ending yesterday.</p>
              </div>
              <span className="status-chip">
                {confirmationSettings.automationEnabled && automationLive ? "enabled" : "off"}
              </span>
            </div>
            <form action={saveTimeCardConfirmationSettingsAction} className="auth-form">
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label className="checkbox-row">
                <input
                  defaultChecked={confirmationSettings.automationEnabled}
                  disabled={!automationLive}
                  name="automationEnabled"
                  type="checkbox"
                />
                <span>Send employee confirmations automatically</span>
              </label>
              <div className="form-grid-two">
                <label className="field">
                  <span>Send day</span>
                  <select defaultValue={confirmationSettings.sendDayOfWeek} name="sendDayOfWeek">
                    {weekdayOptions.map((day, index) => (
                      <option key={day} value={index}>{day}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Send time</span>
                  <input defaultValue={confirmationSettings.sendTimeLocal} name="sendTimeLocal" type="time" />
                </label>
              </div>
              <label className="field">
                <span>Schedule timezone</span>
                <input defaultValue={confirmationSettings.timezone} name="timezone" />
              </label>
              <label className="field">
                <span>Days in each confirmation period</span>
                <input defaultValue={confirmationSettings.periodDays} max="31" min="1" name="periodDays" type="number" />
              </label>
              {!automationLive ? (
                <p className="auth-helper">Production cron must be configured before weekly email automation can be enabled.</p>
              ) : null}
              <button className="pill pill-button" type="submit">Save weekly schedule</button>
            </form>

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
                      <button className="pill primary pill-button" type="submit">Send confirmation email</button>
                    </form>
                  ) : null}
                </article>
              ))}
            </div>
            {!employees.length ? (
              <p className="auth-helper">Sync Square employees to create the confirmation roster.</p>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}
