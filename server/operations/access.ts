import { actorCanAccessSchoolModule } from "../auth/authorization.ts";
import type { AuthenticatedActor } from "../auth/types.ts";
import type { OperationsState } from "./repository.ts";

export function filterOperationsForActor(
  operations: OperationsState,
  actor: AuthenticatedActor,
): OperationsState {
  const attendanceAllowed = actorCanAccessSchoolModule(actor, "attendance", "view");
  const feesAllowed = actorCanAccessSchoolModule(actor, "fees_finance", "view");
  return {
    attendance: attendanceAllowed ? operations.attendance : [],
    invoices: feesAllowed ? operations.invoices : [],
    payments: feesAllowed ? operations.payments : [],
    metrics: {
      present: attendanceAllowed ? operations.metrics.present : 0,
      absent: attendanceAllowed ? operations.metrics.absent : 0,
      late: attendanceAllowed ? operations.metrics.late : 0,
      attendanceMarked: attendanceAllowed ? operations.metrics.attendanceMarked : 0,
      invoicedPaise: feesAllowed ? operations.metrics.invoicedPaise : 0,
      collectedPaise: feesAllowed ? operations.metrics.collectedPaise : 0,
      outstandingPaise: feesAllowed ? operations.metrics.outstandingPaise : 0,
    },
  };
}
