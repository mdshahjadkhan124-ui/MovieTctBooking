import { Link, useSearchParams } from "react-router-dom";
import { useGetMoviesQuery } from "../api/moviesApi.js";
import { useGetTheatersQuery } from "../api/theatersApi.js";

const FILTER_KEYS = ["search", "city", "language", "genre"];

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort();

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ""])
  );

  const { data: movies, isLoading, isError, error } = useGetMoviesQuery(filters);
  // Unfiltered baseline, used only to build the genre/language dropdown
  // option lists — a separate, independently-cached RTK Query call.
  const { data: allMovies } = useGetMoviesQuery({});
  const { data: theaters } = useGetTheatersQuery();

  const languageOptions = uniqueSorted((allMovies ?? []).map((m) => m.language));
  const genreOptions = uniqueSorted((allMovies ?? []).flatMap((m) => m.genres ?? []));
  const cityOptions = uniqueSorted((theaters ?? []).map((t) => t.location?.city));

  const handleFilterChange = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const activeFilters = FILTER_KEYS.filter((key) => filters[key]);
  const clearFilters = () => setSearchParams({}, { replace: true });

  return (
    <section className="bg-surface px-8 py-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Recommended Movies</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={filters.city}
          onChange={(e) => handleFilterChange("city", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
        >
          <option value="">All cities</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>

        <select
          value={filters.language}
          onChange={(e) => handleFilterChange("language", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
        >
          <option value="">All languages</option>
          {languageOptions.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>

        <select
          value={filters.genre}
          onChange={(e) => handleFilterChange("genre", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
        >
          <option value="">All genres</option>
          {genreOptions.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((key) => (
            <span
              key={key}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {key}: {filters[key]}
              <button
                type="button"
                aria-label={`Clear ${key} filter`}
                onClick={() => handleFilterChange(key, "")}
                className="font-bold"
              >
                &times;
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-gray-500 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {isLoading && <p className="text-gray-500">Loading movies...</p>}

      {isError && (
        <p className="text-red-600">
          Failed to load movies: {error?.status ?? "unknown error"}
        </p>
      )}

      {movies && movies.length === 0 && (
        <p className="text-gray-500">No movies match your filters.</p>
      )}

      {movies && movies.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {movies.map((movie) => (
            <li
              key={movie._id}
              className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-gray-100"
            >
              <Link to={`/movies/${movie._id}`} className="block">
                <div className="relative aspect-[2/3] bg-gray-100">
                  {movie.posterUrl ? (
                    <img
                      src={movie.posterUrl}
                      alt={movie.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                      No poster
                    </div>
                  )}
                  {typeof movie.rating === "number" && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-navy/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      &#9733; {movie.rating}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate font-medium text-gray-900">{movie.title}</p>
                  <p className="truncate text-xs text-gray-500">{movie.genres?.join(", ")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default HomePage;
