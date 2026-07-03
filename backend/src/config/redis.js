import { createClient } from "redis";

let client;

export const connectRedis = async () => {
  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (err) => console.error("Redis error", err));
  await client.connect();
  console.log("Redis connected");
  return client;
};

export const getRedisClient = () => {
  if (!client) {
    throw new Error("Redis client not initialized — call connectRedis() first");
  }
  return client;
};
