import { Server } from "socket.io";

let io;

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

  io.on("connection", (socket) => {
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
    // reconnect is a brand-new socket with a new id, not a resumed one.
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
