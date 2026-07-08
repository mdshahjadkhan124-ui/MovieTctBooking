import { Server } from "socket.io";
import jwt from "jsonwebtoken";

let io;

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
// connected client. Scaling to multiple server instances later just needs
// io.adapter(createAdapter(pubClient, subClient)) here, reusing the Redis
// client this project already has (config/redis.js) — nothing about the
// room/emit shape below would need to change.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

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
