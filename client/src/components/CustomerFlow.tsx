import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export function CustomerFlow({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="auth-page">
        <p>Loading…</p>
      </main>
    );
  }

  if (user?.role === "admin") {
    return <Navigate to="/admin/bookings" replace />;
  }

  return children;
}
