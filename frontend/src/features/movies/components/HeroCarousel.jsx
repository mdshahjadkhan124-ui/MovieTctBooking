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
      className="relative h-[320px] w-full overflow-hidden bg-navy sm:h-[420px] md:h-[480px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {movie.backdropUrl || movie.posterUrl ? (
        <img
          key={movie._id}
          src={movie.backdropUrl || movie.posterUrl}
          alt={movie.title}
          className="absolute inset-0 h-full w-full object-cover motion-safe:animate-[fade-in_700ms_ease-out]"
        />
      ) : (
        <div className="absolute inset-0 bg-navy" />
      )}
      {/* Flat wash for overall legibility, plus a tighter bottom gradient
          just behind the text block — restrained, not a heavy scrim. */}
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />

      <div className="absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 pb-10 text-white sm:px-10 sm:pb-14">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">{movie.title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-200">
          {typeof movie.rating === "number" && (
            <span className="flex items-center gap-1 font-medium text-white">
              &#9733; {movie.rating.toFixed(1)}
            </span>
          )}
          {movie.genres?.length > 0 && <span>{movie.genres.join(", ")}</span>}
        </div>
        <Link
          to={`/movies/${movie._id}`}
          className="mt-3 w-fit rounded-md bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
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
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 text-lg text-white transition-colors hover:border-white/50 hover:bg-white/10"
          >
            &#8249;
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => goTo(index + 1)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 text-lg text-white transition-colors hover:border-white/50 hover:bg-white/10"
          >
            &#8250;
          </button>
          <div className="absolute bottom-4 right-6 flex gap-2 sm:bottom-5 sm:right-10">
            {movies.map((m, i) => (
              <button
                key={m._id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-6 bg-primary" : "w-1.5 bg-white/40"
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
