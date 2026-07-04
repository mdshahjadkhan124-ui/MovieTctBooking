const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";

// TMDB's original_language is an ISO 639-1 code; the app's Movie schema
// stores a free-text display name, so only the languages this catalog
// actually seeds need an entry here.
const LANGUAGE_NAMES = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  pa: "Punjabi",
  bn: "Bengali",
  mr: "Marathi",
  ur: "Urdu",
};

const CERTIFICATIONS = ["U", "UA", "A"];

const MAX_NETWORK_RETRIES = 6;
const RETRY_DELAY_MS = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// TMDB's API has been observed to intermittently reset the TLS connection
// from this host before ever reaching their server (separate from any
// actual API error) — a short retry rides that out instead of failing the
// whole seed run on a transient blip.
const tmdbFetch = async (path, params = {}) => {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) throw new Error("TMDB_API_KEY is not set");

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  let lastNetworkError;
  for (let attempt = 1; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
    } catch (err) {
      lastNetworkError = err;
      if (attempt < MAX_NETWORK_RETRIES) await sleep(RETRY_DELAY_MS);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`TMDB request to ${path} failed (${res.status}): ${body}`);
    }
    return res.json();
  }
  throw new Error(
    `TMDB request to ${path} failed after ${MAX_NETWORK_RETRIES} attempts: ${lastNetworkError?.message}`
  );
};

export const searchMovieId = async (title, year) => {
  const params = { query: title };
  // A bare title search is ambiguous for common words ("Queen" matches many
  // unrelated films) — a release-year hint disambiguates without needing a
  // hardcoded TMDB id.
  if (year) params.primary_release_year = year;

  const data = await tmdbFetch("/search/movie", params);
  const match = data.results?.[0];
  if (!match) throw new Error(`No TMDB match found for "${title}"${year ? ` (${year})` : ""}`);
  return match.id;
};

// India's CBFC (U/UA/A) and the US MPA (G/PG/PG-13/R/NC-17) aren't a clean
// 1:1 mapping, so this only trusts an actual IN/US certification when it
// already happens to be one of our three values, and otherwise falls back
// to a sensible default rather than guessing at an equivalence.
const extractCertification = (releaseDatesResults = []) => {
  const inRelease = releaseDatesResults.find((r) => r.iso_3166_1 === "IN");
  const usRelease = releaseDatesResults.find((r) => r.iso_3166_1 === "US");
  const candidates = [
    ...(inRelease?.release_dates ?? []),
    ...(usRelease?.release_dates ?? []),
  ];
  const found = candidates.map((d) => d.certification).find((c) => CERTIFICATIONS.includes(c));
  return found ?? "UA";
};

/**
 * Looks up a movie by title on TMDB and maps it onto this app's Movie
 * schema shape. Used only at seed time — the app never calls TMDB at
 * runtime, so this never touches a real request/response cycle.
 */
export const getMovieForSeed = async (title, year) => {
  const id = await searchMovieId(title, year);
  const details = await tmdbFetch(`/movie/${id}`, {
    append_to_response: "credits,release_dates",
  });

  const genres = details.genres?.map((g) => g.name) ?? [];
  const language = LANGUAGE_NAMES[details.original_language] ?? details.original_language;
  const castList = (details.credits?.cast ?? []).slice(0, 5).map((c) => c.name);
  const certification = extractCertification(details.release_dates?.results);

  return {
    title: details.title,
    description: details.overview,
    durationMinutes: details.runtime || 120,
    genres,
    language,
    certification,
    releaseDate: details.release_date ? new Date(details.release_date) : undefined,
    rating: details.vote_average,
    castList,
    posterUrl: details.poster_path ? `${TMDB_IMAGE_BASE_URL}${details.poster_path}` : undefined,
    isActive: true,
  };
};
