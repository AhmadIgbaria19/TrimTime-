import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { postAuthPath, safeNextPath } from "../lib/nav";

export function LoginPage() {
  const { user, login } = useAuth();
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
      const signedIn = await login({
        phone: String(form.get("phone") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      navigate(postAuthPath(signedIn.role, next));
    } catch (err) {
      setError(err instanceof Error ? tApi(err.message) : t("auth.signInFail"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">{t("auth.welcomeBack")}</p>
        <h1>{t("auth.signIn")}</h1>
        <p className="lede">{t("auth.signInLede")}</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            {t("auth.phone")}
            <input name="phone" type="tel" autoComplete="tel" required placeholder="0591234567" />
          </label>
          <label>
            {t("auth.password")}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-gold" type="submit" disabled={submitting}>
            {submitting ? t("auth.signingIn") : t("auth.signIn")}
          </button>
        </form>
        <p className="form-hint">{t("auth.passwordReset")}</p>
        <p className="auth-switch">
          {t("auth.newHere")} <Link to="/register" state={next ? { from: next } : undefined}>{t("auth.createAccount")}</Link>
        </p>
      </section>
    </main>
  );
}
