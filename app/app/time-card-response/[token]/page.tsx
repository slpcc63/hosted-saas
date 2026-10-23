import { isTcmDeliveryOff } from "@/lib/tcm-delivery-policy";
import { EmployeeLegalLinks } from "@/components/employee-legal-links";
import { notFound } from "next/navigation";

import {
  saveTimeCardEmployeeSmsConsentAction,
  submitTimeCardEmployeeResponseAction
} from "@/app/app/actions";
import { SiteHeader } from "@/components/site-header";
import { getPublicTimeCardConfirmationRequest } from "@/lib/time-card-email-workflow";

type EmployeeResponsePageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

export default async function EmployeeResponsePage({
  params,
  searchParams
}: EmployeeResponsePageProps) {
  const { token } = await params;
  const query = await searchParams;
  const request = await getPublicTimeCardConfirmationRequest(token);

  if (!request) {
    notFound();
  }

  const expired = request.tokenExpiresAt.getTime() <= Date.now();
  const canRespond = request.status === "pending" && !expired;
  const responseLabel = request.responseCode === "a"
    ? "Did not work"
    : request.responseCode === "b"
      ? `Worked ${request.reportedTimeIn ?? ""}–${request.reportedTimeOut ?? ""}`
      : null;
  const scheduledShiftLabel = request.scheduledStartAt && request.scheduledEndAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: request.timezone
      }).format(request.scheduledStartAt)
    : null;

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">Secure time confirmation</div>
            <h1>Confirm your time</h1>
            <p>
              {request.requestKind === "missing_punch"
                ? `${request.companyName} is missing ${request.missingPunchKind === "missing_clock_in" ? "a clock-in" : "a clock-out"} for ${request.employeeName}'s shift on ${scheduledShiftLabel}.`
                : `${request.companyName} asked ${request.employeeName} to confirm time for ${request.periodStart} through ${request.periodEnd}.`}
            </p>

            {query?.saved === "response" ? (
              <p className="form-success">
                Your response was submitted. A manager will review it before it becomes
                an approved record.
              </p>
            ) : null}
            {query?.saved === "sms_consent" ? (
              <p className="form-success">
                Text-message consent was saved. Future Time Card Manager requests may
                be sent to your mobile number.
              </p>
            ) : null}
            {query?.error === "response_expired" || expired ? (
              <p className="form-error">
                This private link has expired. Ask your manager to send a new request.
              </p>
            ) : null}
            {query?.error === "response_already_submitted" ? (
              <p className="form-error">This request has already been submitted.</p>
            ) : null}
            {query?.error === "response_invalid" ? (
              <p className="form-error">This response link is invalid.</p>
            ) : null}
            {query?.error === "response_validation" ? (
              <p className="form-error">
                Choose whether you worked. If you worked, provide a valid shift date,
                time in, and time out.
              </p>
            ) : null}
            {query?.error === "sms_consent_invalid" ? (
              <p className="form-error">
                Enter a valid 10-digit US mobile number and check the consent box.
              </p>
            ) : null}

            {canRespond ? (
              <form action={submitTimeCardEmployeeResponseAction} className="auth-form">
                <input name="token" type="hidden" value={token} />
                <fieldset className="response-choice-group">
                  <legend>Which statement is correct?</legend>
                  <label className="response-choice">
                    <input name="responseCode" type="radio" value="a" required />
                    <span>
                      <strong>I did not work</strong>
                      No hours should be reported for this shift.
                    </span>
                  </label>
                  <label className="response-choice">
                    <input name="responseCode" type="radio" value="b" required />
                    <span>
                      <strong>I worked</strong>
                      Enter the actual times for this shift below.
                    </span>
                  </label>
                </fieldset>
                <div className={request.requestKind === "missing_punch" ? "form-grid-two" : "form-grid-three"}>
                  {request.requestKind === "missing_punch" ? (
                    <input name="shiftDate" type="hidden" value={request.periodStart} />
                  ) : (
                    <label className="field">
                      <span>Shift date</span>
                      <input name="shiftDate" type="date" />
                    </label>
                  )}
                  <label className="field">
                    <span>Time in</span>
                    <input name="timeIn" type="time" />
                  </label>
                  <label className="field">
                    <span>Time out</span>
                    <input name="timeOut" type="time" />
                  </label>
                </div>
                <label className="field">
                  <span>Optional note</span>
                  <textarea
                    name="responseNote"
                    placeholder="Add context your manager should know."
                    maxLength={2000}
                    rows={4}
                  />
                </label>
                <p className="auth-helper">
                  Times are interpreted in {request.timezone}. Your manager can correct them
                  during review.
                </p>
                <button className="pill primary pill-button" type="submit">
                  Submit response
                </button>
              </form>
            ) : responseLabel ? (
              <div className="metric">
                <strong>Response received</strong>
                {responseLabel}
                <p>Status: {request.status.replaceAll("_", " ")}</p>
              </div>
            ) : !expired ? (
              <p className="form-error">This request is no longer accepting responses.</p>
            ) : null}

            {!expired && !isTcmDeliveryOff() ? (
              <section className="sms-consent-panel" aria-labelledby="sms-consent-heading">
                <div className="eyebrow">Optional text notifications</div>
                <h2 id="sms-consent-heading">Receive future confirmations by text</h2>
                {request.smsConsentAt ? (
                  <p className="form-success">
                    Text notifications are enabled for {request.maskedPhone ?? "your saved number"}.
                  </p>
                ) : (
                  <form action={saveTimeCardEmployeeSmsConsentAction} className="auth-form">
                    <input name="token" type="hidden" value={token} />
                    <label className="field">
                      <span>US mobile number</span>
                      <input
                        autoComplete="tel"
                        inputMode="tel"
                        name="phone"
                        placeholder="(555) 555-0123"
                        required
                        type="tel"
                      />
                    </label>
                    <label className="consent-checkbox">
                      <input name="smsConsent" required type="checkbox" />
                      <span>
                        I agree to receive recurring SLPCC63 Time Card Manager texts
                        about weekly time confirmations, reminders, and response receipts
                        at the number provided. Message frequency varies, typically 1–3
                        messages per week. Message and data rates may apply. Consent is not
                        a condition of employment. Reply <strong>STOP</strong> to opt out or
                        <strong> HELP</strong> for help. View the <a href="/terms">Terms</a>
                        {" "}and <a href="/privacy">Privacy Policy</a>.
                      </span>
                    </label>
                    <button className="pill primary pill-button" type="submit">
                      Agree and enable texts
                    </button>
                  </form>
                )}
              </section>
            ) : null}
          </article>

          <aside className="dashboard-card auth-card">
            <div className="eyebrow">What happens next</div>
            <h2>A manager reviews every response</h2>
            <ul className="checklist compact-list">
              <li>Your response is not automatically written to Square.</li>
              <li>A manager can review, correct, approve, or reject the submission.</li>
              <li>The original response and manager decision are retained in an audit trail.</li>
            </ul>
          </aside>
        </section>
        <EmployeeLegalLinks />
      </main>
    </>
  );
}
