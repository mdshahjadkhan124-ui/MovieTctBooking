import { io } from "socket.io-client";

// The REST API base URL includes "/api"; Socket.IO connects to the bare
// server origin instead, so this derives one from the other rather than
// requiring a second env var for what's really the same backend host.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

// autoConnect is off — only the seat-selection page needs a live connection,
// so it connects on mount and disconnects on unmount rather than holding a
// socket open for the whole app session. socket.io-client's built-in
// reconnection (reconnection: true by default) handles drops/idling.
export const socket = io(SOCKET_URL, {
  autoConnect: false,
  withCredentials: true,
});
