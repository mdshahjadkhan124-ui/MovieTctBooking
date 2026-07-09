import { useParams, useNavigate } from "react-router-dom";
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

const MovieDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: movie, isLoading: isMovieLoading, isError: isMovieError } = useGetMovieByIdQuery(id);
  const { data: showtimes, isLoading: isShowtimesLoading } = useGetShowtimesByMovieQuery(id);

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

        {showtimes && showtimes.length === 0 && (
          <p className="text-gray-500">No showtimes currently scheduled for this movie.</p>
        )}

        {showtimes && showtimes.length > 0 && (
          <ul className="flex flex-col gap-2">
            {showtimes.map((showtime) => (
              <li key={showtime._id}>
                <button
                  type="button"
                  onClick={() => navigate(`/showtimes/${showtime._id}/seats`)}
                  className="flex w-full flex-col gap-1 rounded-md border border-gray-200 p-4 text-left transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-900">{showtime.theater?.name}</p>
                    <p className="text-sm text-gray-500">
                      {showtime.theater?.location?.city} &middot; {showtime.screen?.name} &middot;{" "}
                      {showtime.format}
                    </p>
                  </div>
                  <div className="text-sm text-gray-700 sm:text-right">
                    <p className="font-medium">{new Date(showtime.startTime).toLocaleString()}</p>
                    <p className="text-gray-500">&#8377;{showtime.price}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
};

export default MovieDetailPage;
