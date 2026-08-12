import { useParams, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useGetMovieByIdQuery } from "../api/moviesApi.js";
import { useGetShowtimesByMovieQuery } from "../api/showtimesApi.js";

const formatDuration = (minutes) => {
  if (!minutes) return null;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const formatReleaseDate = (date) =>
  date
    ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;

const formatDateHeading = (date) =>
  new Date(date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

const formatTime = (date) =>
  new Date(date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// A real multiplex chain only ever lists a handful of branches per city on
// a movie's page — this is that cap, not a pagination limit (there's no
// "show more"), so a city with more than this many theaters just shows its
// first 5 (by name) rather than growing the page unbounded.
const MAX_THEATERS_PER_CITY = 5;

const groupByDate = (showtimes) => {
  const byDate = new Map(); // dateKey -> { date, showtimes: [] }
  for (const showtime of showtimes) {
    const date = new Date(showtime.startTime);
    const key = date.toDateString();
    if (!byDate.has(key)) byDate.set(key, { date, showtimes: [] });
    byDate.get(key).showtimes.push(showtime);
  }
  return Array.from(byDate.values());
};

// Showtimes arrive sorted by startTime — every grouping step below is a
// partition, never a re-sort, so chronological order within a theater/date
// is preserved for free. Theater and city groups are sorted by name rather
// than by whichever slot happens to sort first, so the list doesn't
// reshuffle as showtimes are booked/expire. The city level only matters
// when "All Cities" is selected (a single-city selection already comes back
// pre-filtered from the API, so it naturally collapses to one group here).
const groupShowtimes = (showtimes) => {
  const byCity = new Map(); // city -> Map(theaterId -> { theater, showtimes: [] })
  for (const showtime of showtimes ?? []) {
    const theater = showtime.theater;
    const city = theater?.location?.city;
    if (!theater?._id || !city) continue;
    if (!byCity.has(city)) byCity.set(city, new Map());
    const theaters = byCity.get(city);
    if (!theaters.has(theater._id)) theaters.set(theater._id, { theater, showtimes: [] });
    theaters.get(theater._id).showtimes.push(showtime);
  }

  return Array.from(byCity.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([city, theaters]) => ({
      city,
      theaters: Array.from(theaters.values())
        .sort((a, b) => a.theater.name.localeCompare(b.theater.name))
        .slice(0, MAX_THEATERS_PER_CITY)
        .map(({ theater, showtimes: theaterShowtimes }) => ({
          theater,
          screenName: theaterShowtimes[0]?.screen?.name,
          dateGroups: groupByDate(theaterShowtimes),
        })),
    }));
};

const MovieDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const selectedCity = useSelector((state) => state.city.selectedCity);
  const { data: movie, isLoading: isMovieLoading, isError: isMovieError } = useGetMovieByIdQuery(id);
  const { data: showtimes, isLoading: isShowtimesLoading } = useGetShowtimesByMovieQuery({
    movieId: id,
    city: selectedCity,
  });
  const cityGroups = groupShowtimes(showtimes);

  if (isMovieLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading movie...</p>;
  }

  if (isMovieError || !movie) {
    return <p className="px-8 py-24 text-center text-red-600">Could not load this movie.</p>;
  }

  return (
    <>
      {movie.backdropUrl && (
        <div className="h-48 w-full overflow-hidden sm:h-64 md:h-80">
          <img src={movie.backdropUrl} alt="" className="h-full w-full object-cover" />
        </div>
      )}

      <section className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-md bg-gray-100 shadow-md">
            {movie.posterUrl ? (
              <img src={movie.posterUrl} alt={movie.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                No poster
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-900">{movie.title}</h1>
            <p className="text-sm text-gray-500">
              {movie.genres?.join(", ")} &middot; {movie.language} &middot;{" "}
              {formatDuration(movie.durationMinutes)}
              {movie.certification && <> &middot; {movie.certification}</>}
            </p>
            {formatReleaseDate(movie.releaseDate) && (
              <p className="text-sm text-gray-500">
                Released {formatReleaseDate(movie.releaseDate)}
              </p>
            )}
            {typeof movie.rating === "number" && (
              <p className="text-sm font-medium text-navy">&#9733; {movie.rating.toFixed(1)} / 10</p>
            )}
            <p className="mt-2 text-sm text-gray-700">{movie.description}</p>
          </div>
        </div>

        {movie.castList?.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Cast</h2>
            <div className="flex flex-wrap gap-2">
              {movie.castList.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-surface px-3 py-1 text-xs text-gray-700"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        <h2 className="mt-8 mb-3 text-lg font-semibold text-gray-900">Showtimes</h2>

        {isShowtimesLoading && <p className="text-gray-500">Loading showtimes...</p>}

        {showtimes && cityGroups.length === 0 && (
          <p className="text-gray-500">
            {selectedCity
              ? `No showtimes currently scheduled for this movie in ${selectedCity}.`
              : "No showtimes currently scheduled for this movie."}
          </p>
        )}

        {cityGroups.length > 0 && (
          <div className="flex flex-col gap-8">
            {cityGroups.map(({ city, theaters }) => (
              <div key={city}>
                {/* Only worth a heading of its own when more than one city is
                    in play — a single selected city already says so via each
                    theater's own subheading below. */}
                {cityGroups.length > 1 && (
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {city}
                  </h3>
                )}
                <div className="flex flex-col gap-6">
                  {theaters.map(({ theater, screenName, dateGroups }) => (
                    <div key={theater._id}>
                      <p className="font-medium text-gray-900">{theater.name}</p>
                      <p className="text-sm text-gray-500">
                        {theater.location?.city}
                        {theater.location?.address && <> &middot; {theater.location.address}</>}
                        {screenName && <> &middot; {screenName}</>}
                      </p>
                      <div className="mt-2 flex flex-col gap-1.5">
                        {dateGroups.map(({ date, showtimes: slots }) => (
                          <div key={date.toDateString()} className="flex flex-wrap items-center gap-2">
                            <span className="w-20 shrink-0 text-xs text-gray-400">
                              {formatDateHeading(date)}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {slots.map((showtime) => (
                                <button
                                  key={showtime._id}
                                  type="button"
                                  title={`${showtime.format} · ₹${showtime.price}`}
                                  onClick={() => navigate(`/showtimes/${showtime._id}/seats`)}
                                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-primary hover:text-primary sm:text-sm"
                                >
                                  {formatTime(showtime.startTime)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
};

export default MovieDetailPage;
