import { AppError } from "../utils/AppError.js";

// Only state-changing methods can be abused this way; GETs change nothing.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Header the frontend sends on every API call (see apiSlice.js). Its value
// doesn't matter — its presence does.
export const CSRF_HEADER = "x-requested-with";

const allowedOrigin = () => process.env.CLIENT_URL || "http://localhost:5173";

/**
 * Blocks cross-site request forgery: another site causing the victim's
 * browser to send a state-changing request here with their auth cookie
 * attached automatically. This app is especially exposed to it because the
 * frontend (Vercel) and API (Render) are different sites, which forces
 * `sameSite: "none"` on the session cookie — so the browser's own
 * same-site protection can't be relied on (see generateToken.js).
 *
 * Two independent checks, either of which a forged request fails:
 *
 *  1. Origin (or Referer) must be our own frontend when the browser sends
 *     one. A form post from evil.com carries `Origin: https://evil.com`,
 *     and page JavaScript cannot forge that header.
 *  2. A custom header must be present. A cross-site request carrying a
 *     custom header is not a "simple" request, so the browser must preflight
 *     it — and the CORS allowlist in app.js only answers that preflight for
 *     our own frontend. HTML forms, the classic CSRF vector, cannot send
 *     custom headers at all.
 *
 * Requests arriving with no Origin/Referer are not browser-initiated (curl,
 * server-to-server, the test suite). Those can't be CSRF in the first place:
 * only a browser attaches someone else's cookie for them.
 *
 * Stripe webhooks are exempt by construction — they're mounted before this
 * middleware in app.js, the same trick used to keep them ahead of the JSON
 * parser and the rate limiter.
 */
export const csrfGuard = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const expected = allowedOrigin();
  const origin = req.headers.origin;
  if (origin && origin !== expected) {
    throw new AppError("Cross-site request blocked", 403, "CSRF_BLOCKED");
  }

  // Referer is the fallback for the rare browser/request that omits Origin.
  const referer = req.headers.referer;
  if (!origin && referer && !referer.startsWith(`${expected}/`) && referer !== expected) {
    throw new AppError("Cross-site request blocked", 403, "CSRF_BLOCKED");
  }

  if (!req.headers[CSRF_HEADER]) {
    throw new AppError(
      `Missing ${CSRF_HEADER} header — state-changing requests must be sent by the app, not a plain form post`,
      403,
      "CSRF_BLOCKED"
    );
  }

  next();
};
