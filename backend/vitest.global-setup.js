import { MongoMemoryServer } from "mongodb-memory-server";
import { createClient } from "redis";

// Runs once for the whole `vitest run`, before any test file's own
// connectDB()/connectRedis() call. Both MONGO_URI and REDIS_URL are
// overwritten here (rather than in a per-file beforeAll) so every test file
// transparently connects to isolated infrastructure instead of the real
// dev/production one — no test file needs to know this exists.
//
// Mongo: an in-memory instance, thrown away on teardown. No replica set:
// nothing in this codebase uses Mongo transactions (seat locking is
// Redis-based), so a standalone instance is enough.
//
// Redis: there is no in-memory equivalent, so tests need a real but SEPARATE
// instance — see assertIsolatedRedis below for why this is enforced rather
// than left to convention.
let mongod;

const LOCAL_FALLBACK_REDIS = "redis://127.0.0.1:6379";

/**
 * Splits a Redis URL into the parts that decide whether two URLs point at the
 * same keyspace. The database index lives in the path (`redis://host:6379/2`);
 * an empty path means database 0.
 */
const describeRedis = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || "6379",
    db: (parsed.pathname || "").replace(/^\//, "") || "0",
    // Never logged, never compared — kept out of the returned shape on purpose
    // so an accidental console.log of this object can't leak credentials.
  };
};

const sameKeyspace = (a, b) => a.host === b.host && a.port === b.port && a.db === b.db;

const label = ({ host, port, db }) => `${host}:${port} db=${db}`;

/**
 * Refuses to run the suite against the same Redis keyspace the application
 * uses. Tests write real seat locks (`lock:{showtimeId}:{seatId}`), a
 * per-showtime lock index, and JWT revocation entries; several teardowns
 * scan-and-delete by pattern. Sharing a keyspace with a live deployment means
 * test traffic competes for the same connection quota and any future
 * broadening of a cleanup pattern deletes production keys.
 */
const assertIsolatedRedis = (testUrl, appUrl) => {
  if (!appUrl) return; // fresh clone with no REDIS_URL configured — nothing to collide with
  const test = describeRedis(testUrl);
  const app = describeRedis(appUrl);
  if (!sameKeyspace(test, app)) return;

  throw new Error(
    [
      "",
      "Refusing to run tests: the test Redis and REDIS_URL are the same keyspace.",
      `  both resolve to: ${label(test)}`,
      "",
      "Tests write real seat locks and JWT revocation keys, and some teardowns",
      "delete by pattern — they must not share a keyspace with a deployment.",
      "",
      "Fix by pointing TEST_REDIS_URL at a separate instance:",
      "  - a local Redis (docker run -d -p 6379:6379 redis:7-alpine), or",
      "  - a second free Upstash database (note: Upstash supports only db 0,",
      "    so a different database number on the same host is NOT an option —",
      "    it must be a different instance).",
      "",
    ].join("\n")
  );
};

/** Fails at startup rather than letting every integration file error separately. */
const assertReachable = async (url) => {
  const client = createClient({
    url,
    socket: { connectTimeout: 5000, reconnectStrategy: false },
  });
  client.on("error", () => {}); // handled by the try/catch below
  try {
    await client.connect();
    await client.ping();
  } catch (err) {
    const { host, port, db } = describeRedis(url);
    throw new Error(
      [
        "",
        `Test Redis is unreachable at ${host}:${port} db=${db}`,
        `  ${err.message.split("\n")[0]}`,
        "",
        process.env.TEST_REDIS_URL
          ? "TEST_REDIS_URL is set — check that instance is running and reachable."
          : [
              "TEST_REDIS_URL is not set, so the suite fell back to a local Redis.",
              "Start one (docker run -d -p 6379:6379 redis:7-alpine) or set",
              "TEST_REDIS_URL to a separate instance. It must NOT be the same",
              "instance as REDIS_URL.",
            ].join("\n"),
        "",
      ].join("\n")
    );
  } finally {
    try {
      await client.quit();
    } catch {
      /* already failed to connect */
    }
  }
};

export async function setup() {
  mongod = await MongoMemoryServer.create({ instance: { dbName: "moviebooking_test" } });
  process.env.MONGO_URI = mongod.getUri();

  const testRedisUrl = process.env.TEST_REDIS_URL?.trim() || LOCAL_FALLBACK_REDIS;
  // Compare BEFORE the overwrite below, while REDIS_URL still holds the
  // application's own value.
  assertIsolatedRedis(testRedisUrl, process.env.REDIS_URL?.trim());
  await assertReachable(testRedisUrl);

  // Every test file's connectRedis() reads REDIS_URL, so this one assignment
  // redirects the whole suite — same trick as MONGO_URI above.
  process.env.REDIS_URL = testRedisUrl;
}

export async function teardown() {
  await mongod?.stop();
}
