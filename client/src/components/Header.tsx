import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useSalon } from "../context/SalonContext";

const links = [
  { to: "/#services", label: "Services" },
  { to: "/#barbers", label: "Barbers" },
  { to: "/#hours", label: "Hours" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { catalog } = useSalon();
  const navigate = useNavigate();
  const salonName = catalog?.salon.name ?? "Salon";
  const isAdmin = user?.role === "admin";

  function close() {
    setOpen(false);
  }

  async function onLogout() {
    await logout();
    close();
    navigate("/");
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="wordmark" to={isAdmin ? "/admin" : "/"} onClick={close}>
          {salonName}
        </Link>

        <nav className={open ? "nav nav-open" : "nav"} aria-label="Primary">
          {isAdmin
            ? null
            : links.map((link) => (
                <a key={link.to} href={link.to} onClick={close}>
                  {link.label}
                </a>
              ))}
          {isAdmin ? (
            <>
              <NavLink to="/admin" end onClick={close}>
                Dashboard
              </NavLink>
              <NavLink to="/admin/bookings" onClick={close}>
                Manage Bookings
              </NavLink>
              <NavLink to="/admin/settings" onClick={close}>
                Settings
              </NavLink>
              <span className="nav-user">{user.name}</span>
              <button className="text-btn" type="button" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : user ? (
            <>
              <NavLink to="/bookings" onClick={close}>
                My Bookings
              </NavLink>
              <span className="nav-user">{user.name}</span>
              <button className="text-btn" type="button" onClick={onLogout}>
                Log out
              </button>
              <Link className="btn btn-gold nav-book" to="/book" onClick={close}>
                Book an Appointment
              </Link>
            </>
          ) : (
            <>
              <NavLink to="/login" onClick={close}>
                Sign in
              </NavLink>
              <NavLink to="/register" onClick={close}>
                Create account
              </NavLink>
              <Link className="btn btn-gold nav-book" to="/book" onClick={close}>
                Book an Appointment
              </Link>
            </>
          )}
        </nav>

        <button
          className="menu-toggle"
          type="button"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
