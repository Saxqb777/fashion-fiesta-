import { config } from "dotenv";

/** Loads .env.local then .env for scripts run outside Next.js. Safe when the files are missing. */
export function loadEnv() {
  config({ path: [".env.local", ".env"], quiet: true });
}
