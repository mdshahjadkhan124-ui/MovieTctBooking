import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { initSocket, closeSocket } from "./config/socket.js";
import { initRateLimiters } from "./middleware/rateLimiters.js";
import { startWaitlistSweeper, stopWaitlistSweeper } from "./services/waitlistSweeper.js";

const PORT = process.env.PORT || 5000;
// A hard exit if graceful shutdown itself hangs — Render still needs the
// process to actually exit for the next deploy to proceed, so this is a
// safety net, not the expected path.
const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer;
let shuttingDown = false;

const start = async () => {
  await connectDB();
  await connectRedis();
  // Needs a connected Redis client, and must run before listen() so no
  // request can reach a limiter that hasn't been built yet.
  initRateLimiters();

  // Socket.IO needs the raw http.Server (not the Express app) so it can
  // upgrade connections to WebSocket on the same port as the REST API.
  httpServer = http.createServer(app);
  // Awaited: the Redis pub/sub adapter must be attached before the first
  // client can connect, or early broadcasts wouldn't cross instances.
  await initSocket(httpServer);

  // Catches waitlist holds that expired in Redis, which emits no event —
  // the event-driven triggers (cancel/release/leave) handle everything else.
  startWaitlistSweeper({
    intervalMs: Number(process.env.WAITLIST_SWEEP_INTERVAL_MS) || undefined,
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

// Render sends SIGTERM on every deploy (not just a crash), and Ctrl+C sends
// SIGINT locally — without this, the process used to be killed mid-request
// with nothing unwound: the sweeper's timer, the Socket.IO/Redis-adapter
// connections, the main Redis client, and the Mongo connection all just
// vanished with whatever they were doing.
//
// Order matters: closeSocket() forcibly disconnects any live WebSocket
// clients AND closes the underlying httpServer as part of the same call
// (verified directly — a plain httpServer.close() alone would hang
// indefinitely on any browser tab still holding a seat-map socket open, since
// Node's own server.close() only stops accepting NEW connections and waits
// for existing ones to end on their own). So there is no separate
// httpServer.close() step here — calling it again after closeSocket() would
// just reject with "Server is not running".
const shutdown = (signal) => async () => {
  if (shuttingDown) return; // a second signal mid-shutdown — already stopping, don't restart the sequence
  shuttingDown = true;
  console.log(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    console.error("Graceful shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref(); // never keeps the process alive on its own

  try {
    stopWaitlistSweeper();
    await closeSocket();
    await disconnectRedis();
    await disconnectDB();

    clearTimeout(forceExit);
    console.log("Shutdown complete");
    process.exit(0);
  } catch (err) {
    console.error("Error during shutdown:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", shutdown("SIGTERM"));
process.on("SIGINT", shutdown("SIGINT"));

start();
