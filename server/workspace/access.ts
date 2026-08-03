import type { AuthenticatedActor } from "../auth/types.ts";
import { actorCanAccessSchoolModule } from "../auth/authorization.ts";
import type { WorkspaceState } from "./repository.ts";

export function filterWorkspaceForActor(
  workspace: WorkspaceState,
  actor: AuthenticatedActor,
): WorkspaceState {
  const records = workspace.records.filter((record) =>
    actorCanAccessSchoolModule(actor, record.moduleKey, "view")
  );
  const breakdown = workspace.breakdown.filter((item) =>
    actorCanAccessSchoolModule(actor, item.moduleKey, "view")
  );
  const today = new Date().toISOString().slice(0, 10);
  return {
    records,
    breakdown,
    metrics: {
      total: records.length,
      open: records.filter((record) => record.status === "open").length,
      inProgress: records.filter((record) => record.status === "in_progress").length,
      completed: records.filter((record) => record.status === "completed").length,
      urgent: records.filter((record) =>
        record.priority === "urgent"
        && record.status !== "completed"
        && record.status !== "cancelled"
      ).length,
      overdue: records.filter((record) =>
        Boolean(record.dueDate && record.dueDate < today)
        && record.status !== "completed"
        && record.status !== "cancelled"
      ).length,
      amountPaise: records.reduce(
        (total, record) => total + (record.amountPaise ?? 0),
        0,
      ),
    },
  };
}
