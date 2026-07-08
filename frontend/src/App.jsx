import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import HomePage from "./pages/HomePage.jsx";
import MovieDetailPage from "./pages/MovieDetailPage.jsx";
import SeatSelectionPage from "./pages/SeatSelectionPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import MyBookingsPage from "./pages/MyBookingsPage.jsx";
import ETicketPage from "./pages/ETicketPage.jsx";
import AdminRoute from "./admin/AdminRoute.jsx";
import AdminLayout from "./admin/AdminLayout.jsx";
import AdminMoviesPage from "./admin/pages/AdminMoviesPage.jsx";
import AdminMovieFormPage from "./admin/pages/AdminMovieFormPage.jsx";
import AdminPlaceholderPage from "./admin/pages/AdminPlaceholderPage.jsx";

const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/movies/:id" element={<MovieDetailPage />} />
        <Route path="/showtimes/:id/seats" element={<SeatSelectionPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/bookings" element={<MyBookingsPage />} />
          <Route path="/bookings/:id/ticket" element={<ETicketPage />} />
        </Route>
      </Route>

      <Route path="/admin" element={<AdminRoute />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/movies" replace />} />
          <Route path="movies" element={<AdminMoviesPage />} />
          <Route path="movies/new" element={<AdminMovieFormPage />} />
          <Route path="movies/:id/edit" element={<AdminMovieFormPage />} />
          <Route path="theaters" element={<AdminPlaceholderPage title="Theaters" />} />
          <Route path="screens" element={<AdminPlaceholderPage title="Screens" />} />
          <Route path="showtimes" element={<AdminPlaceholderPage title="Showtimes" />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default App;
