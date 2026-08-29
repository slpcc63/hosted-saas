import { notFound } from "next/navigation";

import { submitMissingPunchDigestAction } from "@/app/app/actions";
import { SiteHeader } from "@/components/site-header";
import { getPublicMissingPunchDigest } from "@/lib/time-card-missing-punch-workflow";

type WeeklyDigestPageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ error?: string; saved?: string }>;
};

function formatShift(startAt: Date, endAt: Date, timezone: string) {
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: timezone }).format(startAt);
  const time = (value: Date) => new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: timezone
  }).format(value);
  return `${date}, ${time(startAt)}–${time(endAt)}`;
}

export default async function WeeklyDigestPage({ params, searchParams }: WeeklyDigestPageProps) {
  const { token } = await params;
  const query = await searchParams;
  const digest = await getPublicMissingPunchDigest(token);
  if (!digest) notFound();
  const expired = digest.expiresAt.getTime() <= Date.now();
  const canRespond = !expired && !digest.submittedAt;

  return (
    <>
      <SiteHeader appMode />
      <main className="shell auth-page">
        <section className="auth-grid">
          <article className="dashboard-card auth-card">
            <div className="eyebrow">Secure weekly time review</div>
            <h1>Review missing punches</h1>
            <p>
              {digest.companyName} found {digest.items.length} unresolved time punch{digest.items.length === 1 ? "" : "es"}
              {` for ${digest.employeeName}`}. Answer every item below, then submit once.
            </p>
            {query?.saved === "response" || digest.submittedAt ? (
              <p className="form-success">Your weekly time review was submitted successfully.</p>
            ) : null}
            {query?.error === "expired" || expired ? (
              <p className="form-error">This secure link has expired. Ask your manager for a new link.</p>
            ) : null}
            {query?.error === "already_submitted" ? (
              <p className="form-error">This weekly review was already submitted.</p>
            ) : null}
            {query?.error === "validation" ? (
              <p className="form-error">Answer every item. For each worked shift, enter a valid time in and time out.</p>
            ) : null}
            {canRespond ? (
              <form action={submitMissingPunchDigestAction} className="auth-form">
                <input name="token" type="hidden" value={token} />
                <div className="stack-list">
                  {digest.items.map((item) => (
                    <fieldset className="dashboard-subcard response-choice-group" key={item.id}>
                      <input name="missingPunchId" type="hidden" value={item.id} />
                      <legend>
                        {item.kind === "missing_clock_in" ? "Missing clock-in" : "Missing clock-out"}
                        {` — ${formatShift(item.scheduledStartAt, item.scheduledEndAt, item.timezone)}`}
                      </legend>
                      <label className="response-choice">
                        <input name={`responseCode:${item.id}`} required type="radio" value="a" />
                        <span><strong>I did not work this shift</strong>No timecard should be created.</span>
                      </label>
                      <label className="response-choice">
                        <input name={`responseCode:${item.id}`} required type="radio" value="b" />
                        <span><strong>I worked this shift</strong>Enter the actual times below.</span>
                      </label>
                      <div className="form-grid-two">
                        <label className="field"><span>Actual time in</span><input name={`timeIn:${item.id}`} type="time" /></label>
                        <label className="field"><span>Actual time out</span><input name={`timeOut:${item.id}`} type="time" /></label>
                      </div>
                    </fieldset>
                  ))}
                </div>
                <p className="auth-helper">Weekly reviews can only be completed through this secure form. Text replies are not accepted for a weekly digest.</p>
                <button className="pill primary pill-button" type="submit">Submit weekly review</button>
              </form>
            ) : null}
          </article>
        </section>
      </main>
    </>
  );
}
