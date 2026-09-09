import { DateTime } from "luxon";

export type BookingStatus =
  | "Pending"
  | "Confirmed"
  | "Rejected"
  | "Cancelled"
  | "Completed"
  | "NoShow"
  | "Expired";

export function evaluateCancel(input: {
  status: BookingStatus;
  startAt: DateTime;
  now: DateTime;
  cancellationHours: number;
}): { allowed: true } | { allowed: false; error: string } {
  if (input.status === "Cancelled") {
    return { allowed: false, error: "This booking is already cancelled." };
  }

  if (input.status !== "Pending" && input.status !== "Confirmed") {
    return { allowed: false, error: "This booking cannot be cancelled." };
  }

  if (input.now >= input.startAt) {
    return { allowed: false, error: "This booking has already started." };
  }

  if (input.status === "Confirmed") {
    const deadline = input.startAt.minus({ hours: Math.max(0, input.cancellationHours) });
    if (input.now > deadline) {
      const hours = Math.max(0, input.cancellationHours);
      return {
        allowed: false,
        error:
          hours === 0
            ? "This booking has already started."
            : `Confirmed visits need at least ${hours} hours’ notice to cancel.`,
      };
    }
  }

  return { allowed: true };
}
