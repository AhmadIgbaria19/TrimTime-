export function safeNextPath(state: unknown) {
  if (!state || typeof state !== "object" || !("from" in state)) {
    return null;
  }
  const from = (state as { from: unknown }).from;
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) {
    return null;
  }
  return from;
}

export function postAuthPath(role: "customer" | "admin", next: string | null) {
  if (role === "admin") {
    if (next?.startsWith("/admin")) {
      return next;
    }
    return "/admin";
  }
  if (next?.startsWith("/admin")) {
    return "/";
  }
  return next ?? "/";
}
