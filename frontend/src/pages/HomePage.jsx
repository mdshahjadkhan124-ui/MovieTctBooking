import { useGetMoviesQuery } from "../api/moviesApi.js";

const HomePage = () => {
  const { data: movies, isLoading, isError, error } = useGetMoviesQuery();

  return (
    <section className="bg-surface px-8 py-8">
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Recommended Movies</h1>

      {isLoading && <p className="text-gray-500">Loading movies...</p>}

      {isError && (
        <p className="text-red-600">
          Failed to load movies: {error?.status ?? "unknown error"}
        </p>
      )}

      {movies && movies.length === 0 && (
        <p className="text-gray-500">No movies available right now.</p>
      )}

      {movies && movies.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {movies.map((movie) => (
            <li
              key={movie._id}
              className="rounded-md bg-white p-4 shadow-sm ring-1 ring-gray-100"
            >
              <p className="font-medium text-gray-900">{movie.title}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default HomePage;
