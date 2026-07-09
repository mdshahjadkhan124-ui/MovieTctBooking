import { useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { useGetMoviesQuery } from "../api/moviesApi.js";
import HeroCarousel from "../features/movies/components/HeroCarousel.jsx";
import MovieRow from "../features/movies/components/MovieRow.jsx";

// City is deliberately not in here — it's a navbar-level preference (see
// features/city/citySlice.js), not a page filter you'd want cleared by
// this page's own "Clear all".
const FILTER_KEYS = ["search", "language", "genre"];
const HERO_SLIDE_COUNT = 5;
const TOP_RATED_COUNT = 10;

const uniqueSorted = (values) => Array.from(new Set(values.filter(Boolean))).sort();
const byRatingDesc = (a, b) => (b.rating ?? 0) - (a.rating ?? 0);

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCity = useSelector((state) => state.city.selectedCity);
  const filters = {
    ...Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? ""])),
    city: selectedCity,
  };

  const { data: movies, isLoading, isError, error } = useGetMoviesQuery(filters);
  // Unfiltered baseline, used only to build the genre/language dropdown
  // option lists — a separate, independently-cached RTK Query call.
  const { data: allMovies } = useGetMoviesQuery({});

  const languageOptions = uniqueSorted((allMovies ?? []).map((m) => m.language));
  const genreOptions = uniqueSorted((allMovies ?? []).flatMap((m) => m.genres ?? []));

  // The hero and "Top Rated" both derive from the same already-fetched,
  // already-filtered `movies` list — no separate query, so they always
  // agree with whatever's currently filtered rather than showing content
  // outside the active filter.
  const topRatedMovies = [...(movies ?? [])].sort(byRatingDesc).slice(0, TOP_RATED_COUNT);
  const heroMovies = topRatedMovies.slice(0, HERO_SLIDE_COUNT);

  const handleFilterChange = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const activeFilters = FILTER_KEYS.filter((key) => filters[key]);
  const clearFilters = () => setSearchParams({}, { replace: true });

  return (
    <>
      {!isLoading && !isError && heroMovies.length > 0 && <HeroCarousel movies={heroMovies} />}

      <section className="bg-surface px-4 py-8 md:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-3">
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

        <MovieRow title="Recommended Movies" movies={movies} />
        <MovieRow title="Top Rated" movies={topRatedMovies} />
      </section>
    </>
  );
};

export default HomePage;
