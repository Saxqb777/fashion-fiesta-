import { AsyncLocalStorage } from "node:async_hooks";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// HTTP driver: works from serverless functions and from scripts.
const make = (connection: string) => drizzle({ client: neon(connection), schema });

/** The real shop. Logins, backups and anything outside a signed in request always use this. */
export const liveDb = make(url);
export type Db = typeof liveDb;

let sandbox: Db | null = null;
/** Practice mode's sandbox. Same tables, separate database, nothing crosses over. */
export function practiceDb(): Db {
  const p = process.env.PRACTICE_DATABASE_URL;
  if (!p) throw new Error("PRACTICE_DATABASE_URL is not set");
  sandbox ??= make(p);
  return sandbox;
}
export const practiceAvailable = () => Boolean(process.env.PRACTICE_DATABASE_URL);

export type DbMode = "live" | "practice";
/** Header the proxy sets from the signed session. Any value sent by a browser is removed there first. */
export const MODE_HEADER = "x-ff-db";

const forced = new AsyncLocalStorage<DbMode>();
/** Run work against one database whatever the request says: reset, seeding, public share links. */
export function withDb<T>(mode: DbMode, fn: () => T): T {
  return forced.run(mode, fn);
}

type HeaderStore = { type: string; headers?: { get(name: string): string | null } };
let requestStore: { getStore(): HeaderStore | undefined } | null | undefined;
function storeFromNext() {
  if (requestStore === undefined) {
    try {
      // Next keeps the incoming request in this store. Reading it here keeps `db` synchronous
      // so every existing query picks the right database without being rewritten.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      requestStore = require("next/dist/server/app-render/work-unit-async-storage.external").workUnitAsyncStorage;
    } catch {
      requestStore = null;
    }
  }
  return requestStore?.getStore();
}

export function dbMode(): DbMode {
  const f = forced.getStore();
  if (f) return f;
  const store = storeFromNext();
  if (store?.headers && store.headers.get(MODE_HEADER) === "practice" && practiceAvailable()) return "practice";
  return "live";
}

export const currentDb = (): Db => (dbMode() === "practice" ? practiceDb() : liveDb);

/** The database for this request: Live, or the Practice sandbox when the signed in person is practising. */
export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const target = currentDb();
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
