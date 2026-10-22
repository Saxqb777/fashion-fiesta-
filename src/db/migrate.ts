import { loadEnv } from "./env";

loadEnv();

async function main() {
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  const { db } = await import("./index");
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Migrations applied.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
