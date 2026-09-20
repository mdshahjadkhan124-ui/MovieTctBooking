// List endpoints used to return every matching document, so a response grew
// without bound with the data (551 showtimes today, one user with 330+
// bookings). These helpers keep every list endpoint reading and answering
// the same way: `?page=&limit=`, with the caller told how much more there is.

export const DEFAULT_PAGE_SIZE = 20;
// A hard ceiling so `?limit=100000` can't be used to pull the whole
// collection — the exact request pagination exists to prevent.
export const MAX_PAGE_SIZE = 100;

/**
 * Reads page/limit off a query object, ignoring anything nonsensical
 * (negative, zero, text, missing) rather than erroring — a bad page number
 * shouldn't fail a browse request.
 */
export const parsePagination = ({ page, limit } = {}) => {
  const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const parsedLimit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE)
  );
  return { page: parsedPage, limit: parsedLimit, skip: (parsedPage - 1) * parsedLimit };
};

/**
 * The metadata half of a paged response. `hasMore` is what a "Load more"
 * button binds to, so the client never has to do the arithmetic itself.
 */
export const paginationMeta = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasMore: page * limit < total,
});
