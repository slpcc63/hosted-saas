import { saveWorkspaceAction } from "@/app/app/actions";
import { Workspace } from "@/lib/workspaces";

type WorkspaceFormProps = {
  redirectTo: "/" | "/dashboard";
  workspace: Workspace | null;
};

export function WorkspaceForm({ redirectTo, workspace }: WorkspaceFormProps) {
  return (
    <form action={saveWorkspaceAction} className="auth-form workspace-form">
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <label className="field">
        <span>Workspace name</span>
        <input
          defaultValue={workspace?.name ?? ""}
          name="name"
          placeholder="SLPCC63 Studio"
          required
        />
      </label>
      <label className="field">
        <span>What should this workspace help you do first?</span>
        <input
          defaultValue={workspace?.onboardingIntent ?? ""}
          name="onboardingIntent"
          placeholder="Launch onboarding, manage clients, or deliver reports"
        />
      </label>
      <label className="field">
        <span>Short description</span>
        <textarea
          className="field-textarea"
          defaultValue={workspace?.description ?? ""}
          name="description"
          placeholder="A short sentence about this workspace and who it serves."
          rows={4}
        />
      </label>
      <button className="pill primary auth-submit" type="submit">
        {workspace ? "Save workspace" : "Create workspace"}
      </button>
    </form>
  );
}
