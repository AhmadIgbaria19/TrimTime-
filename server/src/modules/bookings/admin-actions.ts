import { DateTime } from "luxon";
import type { BookingStatus } from "./cancel-policy.js";

export type AdminBookingAction = "confirm" | "reject" | "complete" | "no-show" | "cancel";

export type AdminActionState = {
  action: AdminBookingAction;
  enabled: boolean;
  reason?: string;
};

const NEXT: Record<AdminBookingAction, { from: BookingStatus; to: BookingStatus }> = {
  confirm: { from: "Pending", to: "Confirmed" },
  reject: { from: "Pending", to: "Rejected" },
  complete: { from: "Confirmed", to: "Completed" },
  "no-show": { from: "Confirmed", to: "NoShow" },
  cancel: { from: "Confirmed", to: "Cancelled" },
};

export function evaluateAdminAction(input: {
  status: BookingStatus;
  action: AdminBookingAction;
  startAt: DateTime;
  now: DateTime;
}): { allowed: true; nextStatus: BookingStatus } | { allowed: false; error: string } {
  const rule = NEXT[input.action];
  if (!rule) {
    return { allowed: false, error: "Unknown action." };
  }
  if (input.status !== rule.from) {
    return {
      allowed: false,
      error: `Only ${rule.from} bookings can be marked ${rule.to}.`,
    };
  }
  if (input.action === "confirm" && input.now >= input.startAt) {
    return {
      allowed: false,
      error: "This request expired when the appointment start time was reached.",
    };
  }
  if (input.action === "reject" && input.now >= input.startAt) {
    return {
      allowed: false,
      error: "This request expired when the appointment start time was reached.",
    };
  }
  if ((input.action === "complete" || input.action === "no-show") && input.now < input.startAt) {
    return {
      allowed: false,
      error: "Complete and no-show are available from the appointment start time.",
    };
  }
  return { allowed: true, nextStatus: rule.to };
}

export function actionsFor(status: BookingStatus, startAt: DateTime, now: DateTime): AdminActionState[] {
  const names: AdminBookingAction[] =
    status === "Pending" ? ["confirm", "reject"] : status === "Confirmed" ? ["complete", "no-show", "cancel"] : [];
  return names.map((action) => {
    const decision = evaluateAdminAction({ status, action, startAt, now });
    return decision.allowed
      ? { action, enabled: true }
      : { action, enabled: false, reason: decision.error };
  });
}
