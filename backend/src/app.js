import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
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

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Mounted before express.json() — the Stripe webhook needs the raw request
// body for signature verification, and express.json() would consume/replace
// it with a parsed object for every route registered after it.
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

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
