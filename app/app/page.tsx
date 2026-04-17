import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { WorkItemForm } from "@/components/work-item-form";
import { WorkItemList } from "@/components/work-item-list";
import { WorkspaceForm } from "@/components/workspace-form";
import { requireSession } from "@/lib/auth/server";
import { getPublicRouting } from "@/lib/request-routing";
import { getWorkItemsForWorkspace } from "@/lib/work-items";
import { getWorkspaceByOwnerId } from "@/lib/workspaces";

const rootDomain =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "slpcc63.com";

type AppHomePageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AppHomePage({ searchParams }: AppHomePageProps) {
  const routing = await getPublicRouting();
  const session = await requireSession(routing.appHomePath);
  const workspace = await getWorkspaceByOwnerId(session.user.id);
  const params = await searchParams;
  const hasWorkspace = Boolean(workspace);
  const workItems = workspace
    ? await getWorkItemsForWorkspace(workspace.id)
    : [];

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Product Surface</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Welcome to the app at app.{rootDomain}</h1>
            <p>
              This page is now your first real product step. Create the
              workspace record that the rest of the SaaS can build around, then
              refine it as the product evolves.
            </p>
            {params?.saved === "workspace" ? (
              <p className="form-success">Workspace saved successfully.</p>
            ) : null}
            {params?.saved === "work_item" ? (
              <p className="form-success">Work item saved successfully.</p>
            ) : null}
            {params?.error === "workspace_name_required" ? (
              <p className="form-error">A workspace name is required before we can save it.</p>
            ) : null}
            {params?.error === "work_item_title_required" ? (
              <p className="form-error">A work item title is required before saving.</p>
            ) : null}
            <div className="stat-row">
              <div className="stat">
                <strong>User</strong>
                {session.user.name}
              </div>
              <div className="stat">
                <strong>Workspace</strong>
                {workspace?.name ?? "Not created yet"}
              </div>
              <div className="stat">
                <strong>Work items</strong>
                {workItems.length}
              </div>
            </div>
            <WorkspaceForm redirectTo={routing.appHomePath} workspace={workspace} />
            {workspace ? (
              <>
                <WorkItemForm
                  redirectTo={routing.appHomePath}
                  workspaceId={workspace.id}
                />
                <WorkItemList
                  items={workItems}
                  redirectTo={routing.appHomePath}
                  workspaceId={workspace.id}
                />
              </>
            ) : null}
          </section>

          <aside className="dashboard-card">
            <h2>Setup snapshot</h2>
            <p>
              Customers see a polished marketing homepage on the root domain,
              then a focused application experience on the app subdomain, all
              backed by one Vercel deployment workflow.
            </p>
            <ul className="checklist compact-list">
              <li>Auth is live with Better Auth.</li>
              <li>Workspace data is stored in Neon.</li>
              <li>Workspace-linked work items are now live.</li>
            </ul>
            {workspace ? (
              <div className="metric workspace-summary">
                <strong>{workspace.slug}</strong>
                {workspace.onboardingIntent ?? "Add an onboarding focus to guide the next feature pass."}
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </>
  );
}
