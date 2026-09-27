import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useGetMeQuery, useLogoutMutation } from "../api/authApi.js";

// superAdminOnly hides a link from theater_admins in the sidebar — Movies
// and Theaters are super_admin-only server-side (adminMovieRoutes.js,
// adminTheaterRoutes.js: authorize("super_admin")), same as Users
// (adminRoutes.js). Screens, Showtimes and Analytics allow both roles
// server-side (authorize("theater_admin", "super_admin")) and stay
// unconditional. This is UX only — the backend independently enforces its
// own role check on every request regardless of what the frontend shows —
// so this list existing is what keeps a theater_admin from ever reaching a
// link that 403s.
const NAV_LINKS = [
  { to: "/admin/movies", label: "Movies", superAdminOnly: true },
  { to: "/admin/theaters", label: "Theaters", superAdminOnly: true },
  { to: "/admin/screens", label: "Screens" },
  { to: "/admin/showtimes", label: "Showtimes" },
  { to: "/admin/analytics", label: "Analytics" },
  { to: "/admin/users", label: "Users", superAdminOnly: true },
];

const navLinkClass = ({ isActive }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100"
  }`;

const AdminLayout = () => {
  const { data: user } = useGetMeQuery();
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-gray-200 bg-white px-4 py-6">
        <div className="text-lg font-bold text-primary">MovieBooking Admin</div>
        <nav className="flex flex-col gap-1">
          {NAV_LINKS.filter((link) => !link.superAdminOnly || user?.role === "super_admin").map(
            (link) => (
              <NavLink key={link.to} to={link.to} className={navLinkClass}>
                {link.label}
              </NavLink>
            )
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <span className="text-sm text-gray-500">Admin Dashboard</span>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-sm text-gray-700">
                {user.name} <span className="text-gray-400">({user.role})</span>
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
