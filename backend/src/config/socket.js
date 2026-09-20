import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import { getRedisClient } from "./redis.js";

let io;
let adapterClients = [];

// Socket.IO's default adapter keeps rooms in the process's own memory, so
// with more than one instance a `seatsUpdated` emitted by the instance that
// handled the lock reaches only the viewers connected to THAT instance —
// everyone else silently sees a stale seat map. The Redis adapter puts those
// broadcasts on a pub/sub channel every instance reads, which is what makes
// horizontal scaling safe. Room/emit code elsewhere stays exactly the same.
//
// Falls back to the in-memory adapter if Redis pub/sub can't be set up: a
// degraded single-instance broadcast is better than refusing to start.
const attachRedisAdapter = async (server) => {
  try {
    const pubClient = getRedisClient().duplicate();
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    adapterClients = [pubClient, subClient];
    server.adapter(createAdapter(pubClient, subClient));
    return true;
  } catch (err) {
    console.error(
      "Socket.IO Redis adapter unavailable — falling back to in-memory broadcasts (correct only on a single instance):",
      err
    );
    return false;
  }
};

// socket.handshake has no cookie-parser middleware in front of it — parse
// the raw Cookie header by hand rather than pulling in a dependency for one
// field.
const parseCookies = (cookieHeader = "") =>
  Object.fromEntries(
    cookieHeader
      .split(";")
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf("=");
        return [pair.slice(0, i).trim(), decodeURIComponent(pair.slice(i + 1).trim())];
      })
  );

// Rooms are per-showtime (`showtime:{id}`) so a seat lock/release only
// broadcasts to clients actually looking at that showtime, not every
// connected client. That room shape is unchanged by the Redis adapter
// attached below — the adapter only decides how far a broadcast travels,
// not who it's addressed to.
export const initSocket = async (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  await attachRedisAdapter(io);

  // Best-effort identity from the same httpOnly JWT cookie `protect` reads.
  // Auth is optional here, not required — anonymous viewers still need
  // showtime rooms for live seat availability (Feature 1). A failed/missing
  // token just means this socket never joins a `user:{id}` room, so it's
  // simply ineligible to receive personal events like waitlistOffer.
  io.use((socket, next) => {
    try {
      const { token } = parseCookies(socket.handshake.headers.cookie);
      if (token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        socket.data.userId = payload.id;
      }
    } catch {
      // Invalid/expired token — treat as anonymous rather than rejecting
      // the connection.
    }
    next();
  });

  io.on("connection", (socket) => {
    if (socket.data.userId) socket.join(`user:${socket.data.userId}`);

    socket.on("joinShowtime", (showtimeId) => {
      if (typeof showtimeId !== "string" || !showtimeId) return;
      socket.join(`showtime:${showtimeId}`);
    });

    socket.on("leaveShowtime", (showtimeId) => {
      if (typeof showtimeId !== "string" || !showtimeId) return;
      socket.leave(`showtime:${showtimeId}`);
    });

    // No server-side reconnection bookkeeping is needed beyond this: when a
    // socket disconnects (network drop, Render idling out, tab close),
    // Socket.IO removes it from its rooms automatically. The client is
    // responsible for re-emitting joinShowtime after it reconnects, since a
    // reconnect is a brand-new socket with a new id, not a resumed one. The
    // `user:{id}` room is rejoined automatically on reconnect too, since the
    // io.use middleware above runs again on every new connection.
    socket.on("disconnect", () => {});
  });

  return io;
};

export const getIO = () => io;

/** Closes the server and the adapter's own Redis connections. */
export const closeSocket = async () => {
  if (io) await io.close();
  await Promise.all(adapterClients.map((client) => client.quit().catch(() => {})));
  adapterClients = [];
  io = null;
};

/**
 * Broadcasts the current locked-seat list to everyone viewing this showtime.
 * Best-effort and synchronous: locking must keep working even if sockets are
 * down or never initialized (e.g. in tests), so this only ever logs on
 * failure — it never throws back into the caller's lock/release/booking flow.
 */
export const emitSeatsUpdated = (showtimeId, lockedSeatIds) => {
  try {
    if (!io) return;
    io.to(`showtime:${showtimeId}`).emit("seatsUpdated", { showtimeId, lockedSeatIds });
  } catch (err) {
    console.error("Socket emit failed:", err);
  }
};

/**
 * Personal, one-to-one notification that a waitlist offer is live — sent
 * only to the notified user's own room, never broadcast to the showtime
 * room (nobody else should even know an offer went out). Same fire-and-log
 * contract as emitSeatsUpdated: never throws back into waitlist processing.
 */
export const emitWaitlistOffer = (userId, payload) => {
  try {
    if (!io) return;
    io.to(`user:${userId}`).emit("waitlistOffer", payload);
  } catch (err) {
    console.error("Socket emit failed:", err);
  }
};
