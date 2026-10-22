import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

// HTTP driver: works from serverless functions and from scripts. Interactive
// transactions (needed from Phase 3) will move to the WebSocket driver then.
export const db = drizzle({ client: neon(url), schema });
export type Db = typeof db;
