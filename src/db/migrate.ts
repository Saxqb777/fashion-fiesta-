import { loadEnv } from "./env";

loadEnv();

async function main() {
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  const { liveDb, practiceAvailable, practiceDb } = await import("./index");
  await migrate(liveDb, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
  // The Practice sandbox keeps the same tables as Live.
  if (practiceAvailable()) {
    await migrate(practiceDb(), { migrationsFolder: "drizzle" });
    console.log("Practice migrations applied.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
