import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CustomerFlow } from "./components/CustomerFlow";
import { DemoBanner } from "./components/DemoBanner";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { AuthProvider } from "./context/AuthContext";
import { SalonProvider } from "./context/SalonContext";
import { AdminPage } from "./pages/AdminPage";
import { BookPage } from "./pages/BookPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { MyBookingsPage } from "./pages/MyBookingsPage";
import { RegisterPage } from "./pages/RegisterPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SalonProvider>
          <DemoBanner />
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/book"
              element={
                <CustomerFlow>
                  <BookPage />
                </CustomerFlow>
              }
            />
            <Route
              path="/bookings"
              element={
                <CustomerFlow>
                  <MyBookingsPage />
                </CustomerFlow>
              }
            />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/bookings" element={<AdminPage />} />
            <Route path="/admin/settings" element={<AdminPage />} />
            <Route path="/admin/settings/:section" element={<AdminPage />} />
          </Routes>
          <Footer />
        </SalonProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
