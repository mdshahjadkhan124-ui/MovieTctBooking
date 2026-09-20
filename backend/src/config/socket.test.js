import "dotenv/config";
import http from "node:http";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import { connectRedis } from "./redis.js";
import { initSocket, emitSeatsUpdated, closeSocket } from "./socket.js";

// Proves the Redis adapter does the thing it exists for: a broadcast emitted
// by ONE server instance reaches a client connected to a DIFFERENT one. With
// the default in-memory adapter this test fails — the second client never
// hears anything.
let redisClient;
let serverA;
let serverB;
let urlA;
let urlB;
let ioB;

const listen = async (server) => {
  await new Promise((resolve) => server.listen(0, resolve));
  return `http://127.0.0.1:${server.address().port}`;
};

const connectClient = (url) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(url, { transports: ["websocket"], reconnection: false });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });

beforeAll(async () => {
  redisClient = await connectRedis();

  // Instance A: the one this process's emit helpers talk to.
  serverA = http.createServer();
  await initSocket(serverA);
  urlA = await listen(serverA);

  // Instance B: a second, independent Socket.IO server sharing the same
  // Redis — standing in for a second Render instance.
  const { Server } = await import("socket.io");
  const { createAdapter } = await import("@socket.io/redis-adapter");
  serverB = http.createServer();
  ioB = new Server(serverB);
  const pub = redisClient.duplicate();
  const sub = pub.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  ioB.adapter(createAdapter(pub, sub));
  ioB.on("connection", (socket) => {
    socket.on("joinShowtime", (showtimeId) => socket.join(`showtime:${showtimeId}`));
  });
  ioB.__clients = [pub, sub];
  urlB = await listen(serverB);
}, 30000);

afterAll(async () => {
  await closeSocket();
  await ioB.close();
  await Promise.all(ioB.__clients.map((c) => c.quit().catch(() => {})));
  await new Promise((resolve) => serverA.close(resolve));
  await new Promise((resolve) => serverB.close(resolve));
  await redisClient.quit();
});

describe("Socket.IO Redis adapter", () => {
  it("uses the Redis adapter, not the in-memory default", () => {
    const { adapter } = ioB.of("/");
    expect(adapter.constructor.name).toMatch(/Redis/);
  });

  it("delivers a seat update emitted on one instance to a client on another", async () => {
    const showtimeId = `socket-test-${Date.now()}`;
    const clientOnB = await connectClient(urlB);
    clientOnB.emit("joinShowtime", showtimeId);
    // Let the join propagate before emitting.
    await new Promise((resolve) => setTimeout(resolve, 300));

    const received = new Promise((resolve, reject) => {
      clientOnB.on("seatsUpdated", resolve);
      setTimeout(() => reject(new Error("no seatsUpdated reached the other instance")), 8000);
    });

    // Emitted through instance A's io — the client is connected to B.
    emitSeatsUpdated(showtimeId, ["A1", "A2"]);

    const payload = await received;
    expect(payload).toEqual({ showtimeId, lockedSeatIds: ["A1", "A2"] });
    clientOnB.close();
  }, 20000);
});
