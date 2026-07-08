import "dotenv/config";
import http from "node:http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./config/socket.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  await connectRedis();

  // Socket.IO needs the raw http.Server (not the Express app) so it can
  // upgrade connections to WebSocket on the same port as the REST API.
  const httpServer = http.createServer(app);
  initSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

start();
