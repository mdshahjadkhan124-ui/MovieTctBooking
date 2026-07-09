import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { sanitizeInput } from "./middleware/sanitize.js";
import { globalRateLimiter } from "./middleware/rateLimiters.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import movieRoutes from "./routes/movieRoutes.js";
import theaterRoutes from "./routes/theaterRoutes.js";
import showtimeRoutes from "./routes/showtimeRoutes.js";
import adminMovieRoutes from "./routes/adminMovieRoutes.js";
import adminTheaterRoutes from "./routes/adminTheaterRoutes.js";
import adminScreenRoutes from "./routes/adminScreenRoutes.js";
import adminShowtimeRoutes from "./routes/adminShowtimeRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

const app = express();

// Security headers (CSP, HSTS, X-Frame-Options, disables X-Powered-By,
// etc.) — first middleware so every response carries them regardless of
// what happens downstream, including error responses.
app.use(helmet());
// helmet's hidePoweredBy already removes this; kept explicit too as cheap
// insurance against a future helmet config change silently turning it back on.
app.disable("x-powered-by");

// In production the frontend origin must come from CLIENT_URL — falling
// back to localhost would silently break CORS for the real deployed
// frontend, so fail loudly at startup instead. The dev fallback keeps
// `npm run dev` working without a .env entry.
if (process.env.NODE_ENV === "production" && !process.env.CLIENT_URL) {
  throw new Error("CLIENT_URL must be set in production for CORS");
}

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Render (and most PaaS hosts) put this app behind a reverse proxy —
// without trusting it, req.ip resolves to the proxy's own address for
// every request, which would make the rate limiter below key on one
// "client" for the entire internet instead of the real caller.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Mounted before express.json() — the Stripe webhook needs the raw request
// body for signature verification, and express.json() would consume/replace
// it with a parsed object for every route registered after it. Being first
// also means webhooks never reach the body-size limit, sanitizer, or rate
// limiter below: Stripe's own retries must never be throttled, and a
// throttled/rejected webhook delivery would leave a real booking stuck
// unconfirmed.
app.use("/api/webhooks", webhookRoutes);

// Explicit limit (matches body-parser's own default, just made
// intentional) — this app only ever sends small JSON payloads (seat
// selections, movie/theater forms), never file uploads.
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
// Strips MongoDB operator keys ($gt, $where, ...) and dot-paths from
// req.body/query/params before anything downstream can query with them.
app.use(sanitizeInput);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Everything below this line is API-rate-limited; everything above
// (webhooks, health checks) is deliberately not — see each one's own
// comment. Socket.IO lives entirely outside /api (its default
// /socket.io/ path), so it's naturally exempt without any special-casing
// here. /api/auth/login and /api/auth/signup carry an additional, much
// stricter limiter of their own (see authRoutes.js).
app.use("/api", globalRateLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/theaters", theaterRoutes);
app.use("/api/showtimes", showtimeRoutes);
app.use("/api/admin/movies", adminMovieRoutes);
app.use("/api/admin/theaters", adminTheaterRoutes);
app.use("/api/admin/screens", adminScreenRoutes);
app.use("/api/admin/showtimes", adminShowtimeRoutes);
app.use("/api/bookings", bookingRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
