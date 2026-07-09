import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useGetMeQuery, useLogoutMutation } from "../api/authApi.js";
import { useGetTheatersQuery } from "../api/theatersApi.js";
import { useDebouncedValue } from "../utils/useDebouncedValue.js";
import { setCity } from "../features/city/citySlice.js";
import ThemedSelect from "./ThemedSelect.jsx";

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort();

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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-surface px-4 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <ThemedSelect
          value={selectedCity}
          onChange={(e) => dispatch(setCity(e.target.value))}
          aria-label="Select city"
          // !important — ThemedSelect's own wrapper already carries an
          // unconditional `inline-block`, which is equal-specificity with
          // (and, depending on Tailwind's generated rule order, can beat)
          // a plain `hidden`. Marking these !important guarantees the
          // responsive show/hide always wins regardless of that ordering.
          className="!hidden shrink-0 font-medium md:!block"
        >
          <option value="">All Cities</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </ThemedSelect>

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
        <Link to="/" className="hover:text-primary">
          Movies
        </Link>
      </nav>
    </header>
  );
};

export default Navbar;
