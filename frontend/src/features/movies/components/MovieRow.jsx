import MovieCard from "./MovieCard.jsx";

const MovieRow = ({ title, movies }) => {
  if (!movies || movies.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-bold text-gray-900">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {movies.map((movie) => (
          <MovieCard key={movie._id} movie={movie} />
        ))}
      </div>
    </section>
  );
};

export default MovieRow;
