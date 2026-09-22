/**
 * First run against an empty database: seedCatalog infers which cities a
 * movie is "relevant" to from the showtimes that already exist, so that a
 * re-run tops up the pairs already playing rather than inventing new ones.
 * On a fresh database there are no showtimes to infer from, every movie gets
 * skipped, and the seed finishes having created a catalogue with nothing
 * bookable in it — movies, theaters and screens, but no showtimes.
 *
 * This is the bootstrap answer for that case: every movie, every city. It is
 * only used when the database holds no showtimes at all; the moment any
 * exist, the relevance-based top-up takes over again.
 *
 * Lives in its own module purely so it can be tested — importing
 * seedCatalog.js would execute the seed, since that file calls run() at the
 * top level.
 */
export const bootstrapEveryMovieInEveryCity = (movieDocs = [], theaterDocs = []) => {
  const allCities = new Set(theaterDocs.map((t) => t.location?.city).filter(Boolean));
  return new Map(movieDocs.map((m) => [m._id.toString(), allCities]));
};
