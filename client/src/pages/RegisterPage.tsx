import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { postAuthPath, safeNextPath } from "../lib/nav";

export function RegisterPage() {
  const { user, register } = useAuth();
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
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Customer account</p>
        <h1>Create an account</h1>
        <p className="lede">
          Booking uses the name and phone on your account. The number is stored in international
          format and is not verified by SMS in this demo.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Full name
            <input name="name" type="text" autoComplete="name" required minLength={2} />
          </label>
          <label>
            Phone number
            <input name="phone" type="tel" autoComplete="tel" required placeholder="0591234567" />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </label>
          <label>
            Confirm password
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
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          Already registered? <Link to="/login" state={next ? { from: next } : undefined}>Sign in</Link>
        </p>
      </section>
    </main>
  );
}
