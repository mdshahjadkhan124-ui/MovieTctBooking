import MovieCard from "./MovieCard.jsx";

const MovieRow = ({ title, movies }) => {
  if (!movies || movies.length === 0) return null;

  return (
    <section className="mb-16">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{title}</h2>
        <div className="mt-2 h-0.5 w-10 bg-primary" />
      </div>
      <div className="flex gap-5 overflow-x-auto pb-2 sm:gap-6">
        {movies.map((movie) => (
          <MovieCard key={movie._id} movie={movie} />
        ))}
      </div>
    </section>
  );
};

export default MovieRow;
