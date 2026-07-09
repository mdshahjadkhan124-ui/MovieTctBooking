import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const AUTO_ADVANCE_MS = 5000;

const HeroCarousel = ({ movies }) => {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  // Reset to the first slide if the featured set itself changes (e.g. the
  // user changes a filter) — otherwise `index` could point past the end of
  // a now-shorter list.
  useEffect(() => {
    setIndex(0);
  }, [movies]);

  useEffect(() => {
    if (isPaused || movies.length <= 1) return undefined;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % movies.length);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timerRef.current);
  }, [isPaused, movies.length]);

  if (!movies || movies.length === 0) return null;

  const movie = movies[index];
  const goTo = (i) => setIndex(((i % movies.length) + movies.length) % movies.length);

  return (
    <div
      className="relative h-[280px] w-full overflow-hidden rounded-lg bg-navy sm:h-[380px] md:h-[440px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {movie.backdropUrl || movie.posterUrl ? (
        <img
          key={movie._id}
          src={movie.backdropUrl || movie.posterUrl}
          alt={movie.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-navy" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      <div className="absolute bottom-0 left-0 flex max-w-xl flex-col gap-2 p-6 text-white sm:p-10">
        <h2 className="text-2xl font-bold sm:text-4xl">{movie.title}</h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-200">
          {typeof movie.rating === "number" && (
            <span className="flex items-center gap-1 font-semibold text-yellow-400">
              &#9733; {movie.rating.toFixed(1)}
            </span>
          )}
          {movie.genres?.length > 0 && <span>{movie.genres.join(", ")}</span>}
        </div>
        <Link
          to={`/movies/${movie._id}`}
          className="mt-2 w-fit rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
        >
          Book Now
        </Link>
      </div>

      {movies.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => goTo(index - 1)}
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60"
          >
            &#8249;
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => goTo(index + 1)}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60"
          >
            &#8250;
          </button>
          <div className="absolute bottom-3 right-4 flex gap-1.5 sm:bottom-4">
            {movies.map((m, i) => (
              <button
                key={m._id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === index ? "bg-primary" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default HeroCarousel;
