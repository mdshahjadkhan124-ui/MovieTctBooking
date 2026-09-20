import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./config/socket.js";
import { initRateLimiters } from "./middleware/rateLimiters.js";
import { startWaitlistSweeper } from "./services/waitlistSweeper.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await connectRedis();
  // Needs a connected Redis client, and must run before listen() so no
  // request can reach a limiter that hasn't been built yet.
  initRateLimiters();

  // Socket.IO needs the raw http.Server (not the Express app) so it can
  // upgrade connections to WebSocket on the same port as the REST API.
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  // Catches waitlist holds that expired in Redis, which emits no event —
  // the event-driven triggers (cancel/release/leave) handle everything else.
  startWaitlistSweeper({
    intervalMs: Number(process.env.WAITLIST_SWEEP_INTERVAL_MS) || undefined,
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();
