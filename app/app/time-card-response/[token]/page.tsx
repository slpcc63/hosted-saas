import { notFound } from "next/navigation";

import { submitTimeCardEmployeeResponseAction } from "@/app/app/actions";
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

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">Secure time confirmation</div>
            <h1>Confirm your time</h1>
            <p>
              {request.companyName} asked {request.employeeName} to confirm time for
              {` ${request.periodStart} through ${request.periodEnd}`}.
            </p>

            {query?.saved === "response" ? (
              <p className="form-success">
                Your response was submitted. A manager will review it before it becomes
                an approved record.
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

            {canRespond ? (
              <form action={submitTimeCardEmployeeResponseAction} className="auth-form">
                <input name="token" type="hidden" value={token} />
                <fieldset className="response-choice-group">
                  <legend>Which statement is correct?</legend>
                  <label className="response-choice">
                    <input name="responseCode" type="radio" value="a" required />
                    <span>
                      <strong>I did not work</strong>
                      No hours should be reported for this period.
                    </span>
                  </label>
                  <label className="response-choice">
                    <input name="responseCode" type="radio" value="b" required />
                    <span>
                      <strong>I worked</strong>
                      Enter the shift date and actual times below.
                    </span>
                  </label>
                </fieldset>
                <div className="form-grid-three">
                  <label className="field">
                    <span>Shift date</span>
                    <input name="shiftDate" type="date" />
                  </label>
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
      </main>
    </>
  );
}
