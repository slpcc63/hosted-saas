import { runCalendarDisconnectIsolationAction } from "./actions";

export type CalendarDisconnectIsolationPageProps = {
  searchParams?: Promise<{
    feeds?: string;
    feeds_restored?: string;
    result?: string;
  }>;
};

export default async function CalendarDisconnectIsolationPage({
  searchParams
}: CalendarDisconnectIsolationPageProps) {
  const params = await searchParams;
  const passed = params?.result === "passed";

  return (
    <main className="shell dashboard">
      <section className="dashboard-card">
        <p className="eyebrow">Synthetic QA only</p>
        <h1>Calendar disconnect database-isolation probe</h1>
        <p>
          This probe runs the Calendar-only local disconnect statements inside a
          serializable transaction, verifies the TCM connection remains, rolls the
          transaction back, and then verifies both original connections are restored.
          It does not call or revoke anything at Square.
        </p>
        {passed ? (
          <div className="dashboard-alert">
            <strong>Rollback probe passed</strong>
            <p>
              Calendar was absent and TCM remained inside the transaction. After
              rollback, both connections and the original enabled-feed count were restored.
              Enabled feeds tested: {params?.feeds ?? "0"}. Feed restoration:{" "}
              {params?.feeds_restored === "true" ? "verified" : "not verified"}.
            </p>
          </div>
        ) : null}
        <form action={runCalendarDisconnectIsolationAction}>
          <button className="pill primary pill-button" type="submit">
            Run reversible database probe
          </button>
        </form>
      </section>
    </main>
  );
}
