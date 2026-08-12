import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useGetMeQuery, useLogoutMutation } from "../api/authApi.js";
import { useGetTheatersQuery } from "../api/theatersApi.js";
import { useDebouncedValue } from "../utils/useDebouncedValue.js";
import { setCity } from "../features/city/citySlice.js";
import ThemedSelect from "./ThemedSelect.jsx";

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort();

const ADMIN_ROLES = ["super_admin", "theater_admin"];

const Navbar = () => {
  const { data: user } = useGetMeQuery();
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const dispatch = useDispatch();

  const { data: theaters } = useGetTheatersQuery();
  const cityOptions = uniqueSorted((theaters ?? []).map((t) => t.location?.city));
  const selectedCity = useSelector((state) => state.city.selectedCity);

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const currentSearchParam = searchParams.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(currentSearchParam);
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Only push a navigation once the debounced value actually diverges from
  // what's already in the URL — otherwise this would redirect to "/" on
  // every page load, not just when the user actually types a search.
  useEffect(() => {
    if (debouncedSearch === currentSearchParam) return;

    const params = new URLSearchParams(location.pathname === "/" ? location.search : "");
    if (debouncedSearch) params.set("search", debouncedSearch);
    else params.delete("search");
    navigate({ pathname: "/", search: params.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keeps the input in sync when the search param changes from elsewhere,
  // e.g. the home page's "Clear filters" button.
  useEffect(() => {
    setSearchInput(currentSearchParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSearchParam]);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await logout();
    navigate("/");
  };

  // The mobile panel is only ever mounted while open, so its links/inputs
  // naturally drop out of tab order when closed — no manual tabIndex juggling.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  const accountLinkClass =
    "text-sm font-medium text-gray-700 transition-colors hover:text-primary";

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-4 md:px-8">
        <Link to="/" className="shrink-0 text-lg font-bold tracking-tight text-gray-900">
          Movie<span className="text-primary">Booking</span>
        </Link>

        <nav className="hidden shrink-0 md:block">
          <Link to="/" className={accountLinkClass}>
            Movies
          </Link>
        </nav>

        <div className="flex-1 md:max-w-sm">
          <input
            type="text"
            placeholder="Search for movies..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-5 md:flex">
          <ThemedSelect
            value={selectedCity}
            onChange={(e) => dispatch(setCity(e.target.value))}
            aria-label="Select city"
          >
            <option value="">All Cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </ThemedSelect>

          {user ? (
            <div className="flex shrink-0 items-center gap-5">
              <Link to="/bookings" className={accountLinkClass}>
                My Bookings
              </Link>
              {ADMIN_ROLES.includes(user.role) && (
                <Link to="/admin" className={accountLinkClass}>
                  Admin
                </Link>
              )}
              {/* A greeting, not an action — stays neutral rather than
                  competing with the actual nav links/buttons for attention. */}
              <span className="text-sm text-gray-500">Hi, {user.name}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Sign in
            </Link>
          )}
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu-panel"
          onClick={() => setIsMenuOpen((open) => !open)}
          className="ml-auto flex shrink-0 flex-col gap-1.5 p-1 md:hidden"
        >
          <span
            className={`h-0.5 w-5 bg-gray-700 transition-transform ${isMenuOpen ? "translate-y-2 rotate-45" : ""}`}
          />
          <span className={`h-0.5 w-5 bg-gray-700 transition-opacity ${isMenuOpen ? "opacity-0" : ""}`} />
          <span
            className={`h-0.5 w-5 bg-gray-700 transition-transform ${isMenuOpen ? "-translate-y-2 -rotate-45" : ""}`}
          />
        </button>
      </div>

      {isMenuOpen && (
        <nav
          id="mobile-menu-panel"
          className="flex flex-col gap-4 border-t border-gray-200 px-4 py-5 md:hidden"
        >
          <Link to="/" className={accountLinkClass}>
            Movies
          </Link>

          <ThemedSelect
            value={selectedCity}
            onChange={(e) => dispatch(setCity(e.target.value))}
            aria-label="Select city"
            className="w-full"
          >
            <option value="">All Cities</option>
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </ThemedSelect>

          <div className="flex flex-col gap-4 border-t border-gray-100 pt-4">
            {user ? (
              <>
                <span className="text-sm text-gray-500">Hi, {user.name}</span>
                <Link to="/bookings" className={accountLinkClass}>
                  My Bookings
                </Link>
                {ADMIN_ROLES.includes(user.role) && (
                  <Link to="/admin" className={accountLinkClass}>
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-fit rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                to="/login"
                className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
};

export default Navbar;
