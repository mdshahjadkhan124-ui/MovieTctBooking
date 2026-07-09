import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { useGetMeQuery } from "../api/authApi.js";
import { useGetTheatersQuery } from "../api/theatersApi.js";
import { setCity } from "../features/city/citySlice.js";

// lucide-react (used elsewhere for generic icons) dropped brand/logo marks
// a while back over trademark concerns, so GitHub/LinkedIn aren't in its
// export list — these are the standard public brand-mark paths instead,
// wrapped to accept the same className prop lucide icons take.
const GithubIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .268.18.58.688.482A10.02 10.02 0 0022 12.017C22 6.484 17.522 2 12 2z" />
  </svg>
);

const LinkedinIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const ADMIN_ROLES = ["super_admin", "theater_admin"];
const GITHUB_URL = "https://github.com/mdshahjadkhan124-ui/MovieTctBooking";
const LINKEDIN_URL = "https://www.linkedin.com/in/md-shahjad-khan-596418229";

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort();

// gray-500 measures ~3.5:1 against the navy background — fine for large
// text/UI components but short of the 4.5:1 AA threshold this footer's
// small (text-xs) labels need; gray-400 (~6.7:1) covers those instead.
const linkClass = "text-gray-300 transition-colors hover:text-primary";
const headingClass = "mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400";

const Footer = () => {
  const { data: user } = useGetMeQuery();
  const { data: theaters } = useGetTheatersQuery();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const cityOptions = uniqueSorted((theaters ?? []).map((t) => t.location?.city));

  const handleCityClick = (city) => {
    dispatch(setCity(city));
    navigate("/");
  };

  return (
    <footer className="bg-navy px-4 py-10 text-sm text-gray-300 md:px-8">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand */}
        <div>
          <Link to="/" className="text-lg font-bold text-primary">
            MovieBooking
          </Link>
          <p className="mt-2 text-gray-300">
            Book tickets for the latest movies, events, and plays near you.
          </p>
          <p className="mt-4 text-xs text-gray-400">A full-stack MERN portfolio project.</p>
        </div>

        {/* Quick Links */}
        <div>
          <h3 className={headingClass}>Quick Links</h3>
          <ul className="flex flex-col gap-2">
            <li>
              <Link to="/" className={linkClass}>
                Movies
              </Link>
            </li>
            {user ? (
              <li>
                <Link to="/bookings" className={linkClass}>
                  My Bookings
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link to="/login" className={linkClass}>
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className={linkClass}>
                    Sign up
                  </Link>
                </li>
              </>
            )}
            {user && ADMIN_ROLES.includes(user.role) && (
              <li>
                <Link to="/admin" className={linkClass}>
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </div>

        {/* Browse by City */}
        <div>
          <h3 className={headingClass}>Browse by City</h3>
          {cityOptions.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {cityOptions.map((city) => (
                <li key={city}>
                  <button
                    type="button"
                    onClick={() => handleCityClick(city)}
                    className={`text-left ${linkClass}`}
                  >
                    {city}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400">No cities yet.</p>
          )}
        </div>

        {/* Project */}
        <div>
          <h3 className={headingClass}>Project</h3>
          <ul className="flex flex-col gap-2">
            <li>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 ${linkClass}`}
              >
                <GithubIcon className="h-4 w-4" />
                View Source
              </a>
            </li>
            <li>
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 ${linkClass}`}
              >
                <LinkedinIcon className="h-4 w-4" />
                Connect
              </a>
            </li>
          </ul>
          <p className="mt-4 text-xs text-gray-400">Built by Md Shahjad Khan</p>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-6 text-xs text-gray-400">
        &copy; {new Date().getFullYear()} MovieBooking. A portfolio project.
      </div>
    </footer>
  );
};

export default Footer;
