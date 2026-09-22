import { Link, NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { LanguageSwitch } from "./LanguageSwitch";
import { useAuth } from "../context/AuthContext";
import { useLocale } from "../context/LocaleContext";
import { useSalon } from "../context/SalonContext";

export function Header() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const { catalog } = useSalon();
  const { t } = useLocale();
  const navigate = useNavigate();
  const salonName = catalog?.salon.name ?? "Salon";
  const isAdmin = user?.role === "admin";

  const links = [
    { to: "/#services", label: t("nav.services") },
    { to: "/#barbers", label: t("nav.barbers") },
    { to: "/#hours", label: t("nav.hours") },
  ];

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

        <nav className={open ? "nav nav-open" : "nav"} aria-label={t("nav.primary")}>
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
                {t("nav.dashboard")}
              </NavLink>
              <NavLink to="/admin/bookings" onClick={close}>
                {t("nav.manageBookings")}
              </NavLink>
              <NavLink to="/admin/settings" onClick={close}>
                {t("nav.settings")}
              </NavLink>
              <span className="nav-user">{user.name}</span>
              <button className="text-btn" type="button" onClick={onLogout}>
                {t("nav.logOut")}
              </button>
            </>
          ) : user ? (
            <>
              <NavLink to="/bookings" onClick={close}>
                {t("nav.myBookings")}
              </NavLink>
              <span className="nav-user">{user.name}</span>
              <button className="text-btn" type="button" onClick={onLogout}>
                {t("nav.logOut")}
              </button>
              <Link className="btn btn-gold nav-book" to="/book" onClick={close}>
                {t("nav.book")}
              </Link>
            </>
          ) : (
            <>
              <NavLink to="/login" onClick={close}>
                {t("nav.signIn")}
              </NavLink>
              <NavLink to="/register" onClick={close}>
                {t("nav.createAccount")}
              </NavLink>
              <Link className="btn btn-gold nav-book" to="/book" onClick={close}>
                {t("nav.book")}
              </Link>
            </>
          )}
        </nav>

        <div className="header-tools">
          <LanguageSwitch />
          <button
            className="menu-toggle"
            type="button"
            aria-expanded={open}
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
            onClick={() => setOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
