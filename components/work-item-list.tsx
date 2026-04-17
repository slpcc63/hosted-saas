import { updateWorkItemStatusAction } from "@/app/app/actions";
import { WorkItem, WorkItemStatus } from "@/lib/work-items";

const statusOrder: WorkItemStatus[] = ["active", "backlog", "done"];

const statusMeta: Record<
  WorkItemStatus,
  {
    description: string;
    label: string;
  }
> = {
  active: {
    label: "In progress",
    description: "Work that deserves attention right now."
  },
  backlog: {
    label: "Backlog",
    description: "Queued work you want visible but not active yet."
  },
  done: {
    label: "Done",
    description: "Completed items you can use as lightweight progress history."
  }
};

function nextStatusOptions(current: WorkItemStatus) {
  return statusOrder.filter((status) => status !== current);
}

type WorkItemListProps = {
  items: WorkItem[];
  redirectTo: string;
  workspaceId: string;
};

export function WorkItemList({
  items,
  redirectTo,
  workspaceId
}: WorkItemListProps) {
  return (
    <div className="work-item-groups">
      {statusOrder.map((status) => {
        const groupedItems = items.filter((item) => item.status === status);

        return (
          <section className="dashboard-card work-item-group" key={status}>
            <div className="work-item-group-header">
              <div>
                <div className="eyebrow">{statusMeta[status].label}</div>
                <p>{statusMeta[status].description}</p>
              </div>
              <strong>{groupedItems.length}</strong>
            </div>

            {groupedItems.length === 0 ? (
              <p className="work-item-empty">No items in this column yet.</p>
            ) : (
              <div className="work-item-list">
                {groupedItems.map((item) => (
                  <article className="work-item-card" key={item.id}>
                    <div className="work-item-copy">
                      <h3>{item.title}</h3>
                      <p>
                        {item.details ??
                          "No extra notes yet. You can keep this lightweight or make each item more explicit as the workflow matures."}
                      </p>
                    </div>
                    <div className="work-item-actions">
                      {nextStatusOptions(item.status).map((nextStatus) => (
                        <form action={updateWorkItemStatusAction} key={nextStatus}>
                          <input name="redirectTo" type="hidden" value={redirectTo} />
                          <input name="workspaceId" type="hidden" value={workspaceId} />
                          <input name="workItemId" type="hidden" value={item.id} />
                          <input name="status" type="hidden" value={nextStatus} />
                          <button className="pill work-item-button" type="submit">
                            Move to {statusMeta[nextStatus].label}
                          </button>
                        </form>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
