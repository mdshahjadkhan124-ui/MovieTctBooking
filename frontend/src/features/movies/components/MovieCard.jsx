import { Link } from "react-router-dom";

const formatDuration = (minutes) => {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

const MovieCard = ({ movie }) => (
  <Link to={`/movies/${movie._id}`} className="group block w-36 shrink-0 sm:w-44">
    <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-gray-100">
      {movie.posterUrl ? (
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
          No poster
        </div>
      )}

      {typeof movie.rating === "number" && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-navy/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          &#9733; {movie.rating.toFixed(1)}
        </span>
      )}

      <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white">
          Book Now
        </span>
      </div>
    </div>

    <div className="mt-2">
      <p className="truncate text-sm font-medium text-gray-900">{movie.title}</p>
      <p className="truncate text-xs text-gray-500">{movie.genres?.join(", ")}</p>
      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-gray-400">
        {movie.language && <span>{movie.language}</span>}
        {movie.language && formatDuration(movie.durationMinutes) && <span>&middot;</span>}
        {formatDuration(movie.durationMinutes) && <span>{formatDuration(movie.durationMinutes)}</span>}
      </div>
    </div>
  </Link>
);

export default MovieCard;
