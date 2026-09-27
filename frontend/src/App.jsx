import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
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
const AdminIndexRedirect = lazy(() => import("./admin/AdminIndexRedirect.jsx"));
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

// Every route element (lazy or not — Suspense around a component that never
// actually suspends is a harmless no-op) gets its own boundary pair, rather
// than one shared at the top. That's what makes "one page crashing" a local
// failure instead of a global one: the boundary sits INSIDE Layout/
// AdminLayout's <Outlet />, so a crash there is caught before it reaches —
// and unmounts — the Navbar/Footer or admin sidebar/header around it.
const withRouteBoundary = (element) => (
  <ErrorBoundary>
    <Suspense fallback={<RouteFallback />}>{element}</Suspense>
  </ErrorBoundary>
);

const App = () => {
  return (
    // The last line of defense: anything above a per-route boundary (Layout,
    // ProtectedRoute, AdminRoute/AdminLayout's own guard logic itself, not
    // just the pages they render) is still caught here rather than
    // whiting out the whole page with no fallback at all.
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={withRouteBoundary(<HomePage />)} />
          <Route path="/movies/:id" element={withRouteBoundary(<MovieDetailPage />)} />
          <Route
            path="/showtimes/:id/seats"
            element={withRouteBoundary(<SeatSelectionPage />)}
          />
          <Route path="/login" element={withRouteBoundary(<LoginPage />)} />
          <Route path="/signup" element={withRouteBoundary(<SignupPage />)} />
          <Route element={<ProtectedRoute />}>
            <Route path="/bookings" element={withRouteBoundary(<MyBookingsPage />)} />
            <Route
              path="/bookings/:id/ticket"
              element={withRouteBoundary(<ETicketPage />)}
            />
          </Route>
        </Route>

        <Route path="/admin" element={withRouteBoundary(<AdminRoute />)}>
          <Route element={withRouteBoundary(<AdminLayout />)}>
            <Route index element={withRouteBoundary(<AdminIndexRedirect />)} />
            <Route path="movies" element={withRouteBoundary(<AdminMoviesPage />)} />
            <Route path="movies/new" element={withRouteBoundary(<AdminMovieFormPage />)} />
            <Route
              path="movies/:id/edit"
              element={withRouteBoundary(<AdminMovieFormPage />)}
            />
            <Route path="theaters" element={withRouteBoundary(<AdminTheatersPage />)} />
            <Route
              path="theaters/new"
              element={withRouteBoundary(<AdminTheaterFormPage />)}
            />
            <Route
              path="theaters/:id/edit"
              element={withRouteBoundary(<AdminTheaterFormPage />)}
            />
            <Route path="screens" element={withRouteBoundary(<AdminScreensPage />)} />
            <Route path="screens/new" element={withRouteBoundary(<AdminScreenFormPage />)} />
            <Route
              path="screens/:id/edit"
              element={withRouteBoundary(<AdminScreenFormPage />)}
            />
            <Route path="showtimes" element={withRouteBoundary(<AdminShowtimesPage />)} />
            <Route
              path="showtimes/new"
              element={withRouteBoundary(<AdminShowtimeFormPage />)}
            />
            <Route
              path="showtimes/:id/edit"
              element={withRouteBoundary(<AdminShowtimeFormPage />)}
            />
            <Route path="analytics" element={withRouteBoundary(<AdminAnalyticsPage />)} />
            <Route path="users" element={withRouteBoundary(<AdminUsersPage />)} />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
};

export default App;
