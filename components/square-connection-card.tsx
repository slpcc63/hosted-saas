import { disconnectSquareAction } from "@/app/app/actions";
import { SquareConnection } from "@/lib/square-connections";

type SquareConnectionCardProps = {
  connection: SquareConnection | null;
  connectHref: string;
  configured: boolean;
  redirectTo: string;
  workspaceId: string;
};

export function SquareConnectionCard({
  connection,
  connectHref,
  configured,
  redirectTo,
  workspaceId
}: SquareConnectionCardProps) {
  return (
    <section className="dashboard-card square-card">
      <div className="eyebrow">Square</div>
      <h2>Square connection</h2>
      <p>
        The seller connects their Square account to your hosted app through OAuth.
        Your app owns the onboarding and dashboard experience; Square owns the authorization screen.
      </p>

      {!configured ? (
        <p className="form-error">
          Add your Square application ID, secret, and redirect URI to the environment
          before the connect flow can be enabled.
        </p>
      ) : connection ? (
        <>
          <div className="credential-list">
            <div className="credential-item">
              <strong>Merchant ID</strong>
              <code>{connection.merchantId}</code>
            </div>
            <div className="credential-item">
              <strong>Environment</strong>
              <code>{connection.squareEnvironment}</code>
            </div>
          </div>
          <form action={disconnectSquareAction}>
            <input name="redirectTo" type="hidden" value={redirectTo} />
            <input name="workspaceId" type="hidden" value={workspaceId} />
            <button className="pill square-button" type="submit">
              Disconnect Square
            </button>
          </form>
        </>
      ) : (
        <a className="pill primary square-button" href={connectHref}>
          Connect Square
        </a>
      )}
    </section>
  );
}
