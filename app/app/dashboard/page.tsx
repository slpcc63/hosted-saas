import { SiteHeader } from "@/components/site-header";
import { WorkspaceForm } from "@/components/workspace-form";
import { requireSession } from "@/lib/auth/server";
import { getWorkspaceByOwnerId } from "@/lib/workspaces";

type DashboardPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireSession("/dashboard");
  const workspace = await getWorkspaceByOwnerId(session.user.id);
  const params = await searchParams;

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
            {params?.error === "workspace_name_required" ? (
              <p className="form-error">Please add a workspace name before saving.</p>
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
            <WorkspaceForm redirectTo="/dashboard" workspace={workspace} />
          </section>

          <aside className="dashboard-card">
            <h2>What this unlocks next</h2>
            <p>
              With a user and workspace stored in the database, we now have the
              two core anchors most SaaS products need before adding the first
              real domain-specific workflow.
            </p>
            <ul className="checklist compact-list">
              <li>Stripe customer creation can attach to the workspace.</li>
              <li>Invites and team roles can hang off the workspace ID.</li>
              <li>Your first customer-facing workflow can be keyed to the owner and workspace.</li>
            </ul>
          </aside>
        </div>
      </main>
    </>
  );
}
