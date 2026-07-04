import { Link, useNavigate } from "react-router-dom";
import { useGetMeQuery, useLogoutMutation } from "../api/authApi.js";

const SECONDARY_LINKS = ["Movies", "Stream", "Events", "Plays", "Sports", "Activities"];

const Navbar = () => {
  const { data: user } = useGetMeQuery();
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm">
      <div className="flex items-center gap-4 px-4 py-3 md:px-8">
        <Link to="/" className="text-xl font-bold text-primary">
          MovieBooking
        </Link>

        <div className="flex-1">
          <input
            type="text"
            placeholder="Search for movies, events, plays..."
            className="w-full rounded-md border border-gray-200 bg-surface px-4 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        <button
          type="button"
          className="hidden shrink-0 items-center gap-1 text-sm font-medium text-gray-700 md:flex"
        >
          Bengaluru
        </button>

        {user ? (
          <div className="flex shrink-0 items-center gap-3">
            <Link
              to="/bookings"
              className="text-sm font-medium text-gray-700 hover:text-primary"
            >
              My Bookings
            </Link>
            <span className="hidden text-sm text-gray-500 md:inline">Hi, {user.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Sign in
          </Link>
        )}

        <button
          type="button"
          aria-label="Menu"
          className="flex shrink-0 flex-col gap-1 md:hidden"
        >
          <span className="h-0.5 w-6 bg-gray-700" />
          <span className="h-0.5 w-6 bg-gray-700" />
          <span className="h-0.5 w-6 bg-gray-700" />
        </button>
      </div>

      <nav className="hidden gap-6 border-t border-gray-100 px-8 py-2 text-sm font-medium text-gray-600 md:flex">
        {SECONDARY_LINKS.map((link) => (
          <span key={link} className="cursor-pointer hover:text-primary">
            {link}
          </span>
        ))}
      </nav>
    </header>
  );
};

export default Navbar;
