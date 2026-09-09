import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function BookingTeaser() {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return (
      <section className="book-panel" id="book">
        <p className="eyebrow">Salon desk</p>
        <h2>Manage bookings</h2>
        <p>Add visits for customers from the admin desk. Personal booking is not used on this account.</p>
        <Link className="btn btn-gold" to="/admin/bookings">
          Manage Bookings
        </Link>
      </section>
    );
  }

  return (
    <section className="book-panel" id="book">
      <p className="eyebrow">Appointments</p>
      <h2>Book an Appointment</h2>
      <p>
        See live times sized to each service. Sending the booking, with your name and phone from
        your account, arrives in the next step.
      </p>
      <Link className="btn btn-gold" to="/book">
        {user ? "Check available times" : "See times"}
      </Link>
    </section>
  );
}
