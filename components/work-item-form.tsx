import { createWorkItemAction } from "@/app/app/actions";

type WorkItemFormProps = {
  redirectTo: string;
  workspaceId: string;
};

export function WorkItemForm({ redirectTo, workspaceId }: WorkItemFormProps) {
  return (
    <form action={createWorkItemAction} className="auth-form work-item-form">
      <input name="redirectTo" type="hidden" value={redirectTo} />
      <input name="workspaceId" type="hidden" value={workspaceId} />
      <label className="field">
        <span>Next work item</span>
        <input
          name="title"
          placeholder="Define onboarding checklist, create intake flow, or set up client import"
          required
        />
      </label>
      <label className="field">
        <span>Optional notes</span>
        <textarea
          className="field-textarea"
          name="details"
          placeholder="Add context, success criteria, or notes for the next work item."
          rows={3}
        />
      </label>
      <button className="pill primary auth-submit" type="submit">
        Add work item
      </button>
    </form>
  );
}
