import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { liveDb, practiceAvailable, practiceDb, withDb } from "@/db";
import { users } from "@/db/schema";
import { authConfig } from "./auth.config";
import { logActivity } from "./activity";

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const where = and(eq(users.email, email), isNull(users.deletedAt));
        // Real accounts always sign in against Live.
        const user = await liveDb.query.users.findFirst({ where });
        if (user) {
          if (!user.isActive || !(await bcrypt.compare(password, user.passwordHash))) return null;
          await logActivity({ actor: user, entityType: "user", entityId: user.id, action: "signed_in", summary: `${user.name} signed in` });
          return { id: user.id, name: user.name, email: user.email, role: user.role, practice: user.role === "owner" && user.practiceMode, practiceOnly: false };
        }
        // Practice tailor logins exist only in the sandbox and can only ever see Practice.
        if (!practiceAvailable()) return null;
        const sandboxUser = await practiceDb().query.users.findFirst({ where }).catch(() => undefined);
        if (!sandboxUser || sandboxUser.role !== "tailor" || !sandboxUser.isActive) return null;
        if (!(await bcrypt.compare(password, sandboxUser.passwordHash))) return null;
        await withDb("practice", () =>
          logActivity({ actor: sandboxUser, entityType: "user", entityId: sandboxUser.id, action: "signed_in", summary: `${sandboxUser.name} signed in to Practice` }),
        );
        return { id: sandboxUser.id, name: sandboxUser.name, email: sandboxUser.email, role: sandboxUser.role, practice: true, practiceOnly: true };
      },
    }),
  ],
});
