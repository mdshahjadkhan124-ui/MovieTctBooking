/**
 * Merges a freshly fetched page into the list already in the cache, matching
 * rows by `_id`: rows that are new get appended, rows already present are
 * replaced in place (keeping their position).
 *
 * Why not a plain concat: RTK Query runs an endpoint's `merge` for EVERY
 * response that lands on a cache entry which already holds data — not just
 * for "Load more". A mutation that invalidates the list (cancelling a
 * booking, toggling a showtime) refetches whichever page was loaded last,
 * and a concat would then append that page's rows a second time, showing
 * every one of them twice. Matching on `_id` makes that refetch do what it
 * should: refresh the rows it returned, leaving the rest of the list alone.
 */
export const mergePagedItems = (cached = [], incoming = []) => {
  const byId = new Map(cached.map((item) => [item._id, item]));
  for (const item of incoming) byId.set(item._id, item);
  return [...byId.values()];
};
