import { SiteHeader } from "@/components/site-header";
import { SquareConnectionCard } from "@/components/square-connection-card";
import { WorkItemForm } from "@/components/work-item-form";
import { WorkItemList } from "@/components/work-item-list";
import { WorkspaceForm } from "@/components/workspace-form";
import { requireSession } from "@/lib/auth/server";
import { getPublicRouting } from "@/lib/request-routing";
import { getWorkItemsForWorkspace } from "@/lib/work-items";
import { getSquareConnectionByWorkspaceId } from "@/lib/square-connections";
import { isSquareConfigured } from "@/lib/square";
import { getWorkspaceByOwnerId } from "@/lib/workspaces";

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const routing = await getPublicRouting();
  const session = await requireSession(routing.dashboardPath);
  const workspace = await getWorkspaceByOwnerId(session.user.id);
  const params = await searchParams;
  const workItems = workspace
    ? await getWorkItemsForWorkspace(workspace.id)
    : [];
  const squareConnection = workspace
    ? await getSquareConnectionByWorkspaceId(workspace.id)
    : null;
  const squareConfigured = isSquareConfigured();

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Internal App Shell</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>{workspace ? `${workspace.name} dashboard` : "Finish your workspace setup"}</h1>
            <p>
              This is now backed by a real workspace record in Neon. Treat it as
              the first durable app object we can hang permissions, billing, and
              product workflows off of.
            </p>
            {params?.saved === "workspace" ? (
              <p className="form-success">Workspace changes saved.</p>
            ) : null}
            {params?.saved === "work_item" ? (
              <p className="form-success">Work item updated.</p>
            ) : null}
            {params?.saved === "square_connection" ? (
              <p className="form-success">Square connected successfully.</p>
            ) : null}
            {params?.saved === "square_disconnected" ? (
              <p className="form-success">Square disconnected successfully.</p>
            ) : null}
            {params?.error === "workspace_name_required" ? (
              <p className="form-error">Please add a workspace name before saving.</p>
            ) : null}
            {params?.error === "work_item_title_required" ? (
              <p className="form-error">Please add a work item title before saving.</p>
            ) : null}
            {params?.error === "square_not_configured" ? (
              <p className="form-error">Square environment variables still need to be configured.</p>
            ) : null}
            {params?.error === "square_authorization_failed" ? (
              <p className="form-error">Square authorization was cancelled or failed before the callback completed.</p>
            ) : null}
            {params?.error === "square_token_exchange_failed" ? (
              <p className="form-error">Square returned a callback, but the token exchange failed.</p>
            ) : null}
            <div className="stat-row">
              <div className="stat">
                <strong>Signed in</strong>
                {session.user.email}
              </div>
              <div className="stat">
                <strong>Slug</strong>
                {workspace?.slug ?? "Pending"}
              </div>
              <div className="stat">
                <strong>Focus</strong>
                {workspace?.onboardingIntent ?? "Add one below"}
              </div>
            </div>
            {workspace ? (
              <SquareConnectionCard
                configured={squareConfigured}
                connectHref="/api/integrations/square/connect"
                connection={squareConnection}
                redirectTo={routing.dashboardPath}
                workspaceId={workspace.id}
              />
            ) : null}
            <WorkspaceForm redirectTo={routing.dashboardPath} workspace={workspace} />
            {workspace ? (
              <>
                <WorkItemForm
                  redirectTo={routing.dashboardPath}
                  workspaceId={workspace.id}
                />
                <WorkItemList
                  items={workItems}
                  redirectTo={routing.dashboardPath}
                  workspaceId={workspace.id}
                />
              </>
            ) : null}
          </section>

          <aside className="dashboard-card">
            <h2>What this unlocks next</h2>
            <p>
              With a user and workspace stored in the database, we now have the
              two core anchors most SaaS products need before adding the first
              real domain-specific workflow.
            </p>
            <ul className="checklist compact-list">
              <li>Each work item is tied directly to the workspace.</li>
              <li>Status changes create a lightweight operating cadence.</li>
              <li>The next domain-specific model can grow out of these work items instead of replacing them.</li>
            </ul>
          </aside>
        </div>
      </main>
    </>
  );
}
