import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import HomePage from "./pages/HomePage.jsx";

// Everything below is lazy-loaded: the home page is the one route almost
// every visit starts on, so it (and Layout/ProtectedRoute, which are tiny
// guard/chrome components) stays in the initial bundle. Everything else —
// especially the admin dashboard, which pulls in recharts, and seat
// selection, which pulls in Stripe + socket.io-client — is fetched only
// once a user actually navigates there, which most visits never do.
const MovieDetailPage = lazy(() => import("./pages/MovieDetailPage.jsx"));
const SeatSelectionPage = lazy(() => import("./pages/SeatSelectionPage.jsx"));
const LoginPage = lazy(() => import("./pages/LoginPage.jsx"));
const SignupPage = lazy(() => import("./pages/SignupPage.jsx"));
const MyBookingsPage = lazy(() => import("./pages/MyBookingsPage.jsx"));
const ETicketPage = lazy(() => import("./pages/ETicketPage.jsx"));
const AdminRoute = lazy(() => import("./admin/AdminRoute.jsx"));
const AdminLayout = lazy(() => import("./admin/AdminLayout.jsx"));
const AdminMoviesPage = lazy(() => import("./admin/pages/AdminMoviesPage.jsx"));
const AdminMovieFormPage = lazy(() => import("./admin/pages/AdminMovieFormPage.jsx"));
const AdminTheatersPage = lazy(() => import("./admin/pages/AdminTheatersPage.jsx"));
const AdminTheaterFormPage = lazy(() => import("./admin/pages/AdminTheaterFormPage.jsx"));
const AdminScreensPage = lazy(() => import("./admin/pages/AdminScreensPage.jsx"));
const AdminScreenFormPage = lazy(() => import("./admin/pages/AdminScreenFormPage.jsx"));
const AdminShowtimesPage = lazy(() => import("./admin/pages/AdminShowtimesPage.jsx"));
const AdminShowtimeFormPage = lazy(() => import("./admin/pages/AdminShowtimeFormPage.jsx"));
const AdminAnalyticsPage = lazy(() => import("./admin/pages/AdminAnalyticsPage.jsx"));
const AdminUsersPage = lazy(() => import("./admin/pages/AdminUsersPage.jsx"));

// A blank screen while a route chunk downloads would read as a hang — this
// is deliberately quiet/neutral rather than a branded splash, since it's
// only ever visible for the fraction of a second a small JS chunk takes to
// fetch over an already-warm connection (unlike the slow data fetches
// pages do internally, which have their own loading states).
const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div
      className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-primary"
      role="status"
      aria-label="Loading"
    />
  </div>
);

const App = () => {
  return (
    <Suspense fallback={<RouteFallback />}>
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
            <Route path="theaters" element={<AdminTheatersPage />} />
            <Route path="theaters/new" element={<AdminTheaterFormPage />} />
            <Route path="theaters/:id/edit" element={<AdminTheaterFormPage />} />
            <Route path="screens" element={<AdminScreensPage />} />
            <Route path="screens/new" element={<AdminScreenFormPage />} />
            <Route path="screens/:id/edit" element={<AdminScreenFormPage />} />
            <Route path="showtimes" element={<AdminShowtimesPage />} />
            <Route path="showtimes/new" element={<AdminShowtimeFormPage />} />
            <Route path="showtimes/:id/edit" element={<AdminShowtimeFormPage />} />
            <Route path="analytics" element={<AdminAnalyticsPage />} />
            <Route path="users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};

export default App;
