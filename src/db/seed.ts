import { randomBytes } from "node:crypto";
import { loadEnv } from "./env";

loadEnv();

function generatePassword(length = 12) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { users, settings, numberSequences } = await import("./schema");
  const { DEFAULT_COMPANY, DEFAULT_SEQUENCES } = await import("../lib/defaults");
  const bcrypt = (await import("bcryptjs")).default;

  const existingSettings = await db.query.settings.findFirst();
  if (!existingSettings) {
    await db.insert(settings).values(DEFAULT_COMPANY);
    console.log("Settings row created with company defaults.");
  }
  await db.insert(numberSequences).values(DEFAULT_SEQUENCES).onConflictDoNothing();

  const owner = await db.query.users.findFirst({ where: eq(users.role, "owner") });
  if (owner) {
    console.log(`Owner already exists: ${owner.email}`);
    return;
  }

  const email = (process.env.SEED_OWNER_EMAIL ?? "saaqibkhan58@gmail.com").trim().toLowerCase();
  const name = process.env.SEED_OWNER_NAME ?? "Saaqib";
  const password = process.env.SEED_OWNER_PASSWORD ?? generatePassword();
  await db.insert(users).values({
    name,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    role: "owner",
  });
  console.log("Owner created.");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
