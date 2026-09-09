import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { postAuthPath, safeNextPath } from "../lib/nav";

export function LoginPage() {
  const { user, login } = useAuth();
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
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in</h1>
        <p className="lede">Use the phone number and password from your customer or admin account.</p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Phone number
            <input name="phone" type="tel" autoComplete="tel" required placeholder="0591234567" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn-gold" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="form-hint">
          Password reset is not available in this demo. The salon owner must change it for you.
        </p>
        <p className="auth-switch">
          New here? <Link to="/register" state={next ? { from: next } : undefined}>Create an account</Link>
        </p>
      </section>
    </main>
  );
}
