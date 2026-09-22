import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { postAuthPath, safeNextPath } from "../lib/nav";

export function RegisterPage() {
  const { user, register } = useAuth();
  const { t, tApi } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const next = safeNextPath(location.state);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={postAuthPath(user.role, next)} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSubmitting(true);
    try {
      const created = await register({
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        password: String(form.get("password") ?? ""),
        confirmPassword: String(form.get("confirmPassword") ?? ""),
      });
      navigate(postAuthPath(created.role, next));
    } catch (err) {
      setError(err instanceof Error ? tApi(err.message) : t("auth.registerFail"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">{t("auth.customerAccount")}</p>
        <h1>{t("auth.createAccount")}</h1>
        <p className="lede">{t("auth.registerLede")}</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            {t("auth.fullName")}
            <input name="name" type="text" autoComplete="name" required minLength={2} />
          </label>
          <label>
            {t("auth.phone")}
            <input name="phone" type="tel" autoComplete="tel" required placeholder="0591234567" />
          </label>
          <label>
            {t("auth.password")}
            <input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </label>
          <label>
            {t("auth.confirmPassword")}
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-gold" type="submit" disabled={submitting}>
            {submitting ? t("auth.creating") : t("auth.createAccount")}
          </button>
        </form>
        <p className="auth-switch">
          {t("auth.alreadyRegistered")} <Link to="/login" state={next ? { from: next } : undefined}>{t("auth.signIn")}</Link>
        </p>
      </section>
    </main>
  );
}
