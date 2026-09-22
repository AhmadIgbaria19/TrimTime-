import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";

export function CustomerFlow({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useLocale();

  if (loading) {
    return (
      <main className="auth-page">
        <p>{t("loading")}</p>
      </main>
    );
  }

  if (user?.role === "admin") {
    return <Navigate to="/admin/bookings" replace />;
  }

  return children;
}
