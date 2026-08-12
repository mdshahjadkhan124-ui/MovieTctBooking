import { MongoMemoryServer } from "mongodb-memory-server";

// Runs once for the whole `vitest run`, before any test file's own
// connectDB() call. Setting MONGO_URI here (rather than in a per-file
// beforeAll) is what makes every test file transparently connect to this
// isolated instance instead of the real dev database — no test file needs
// to know this exists. No replica set: nothing in this codebase uses Mongo
// transactions (seat locking is Redis-based), so a standalone instance is
// enough.
let mongod;

export async function setup() {
  mongod = await MongoMemoryServer.create({ instance: { dbName: "moviebooking_test" } });
  process.env.MONGO_URI = mongod.getUri();
}

export async function teardown() {
  await mongod?.stop();
}
