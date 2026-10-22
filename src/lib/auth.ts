import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
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

        const user = await db.query.users.findFirst({
          where: and(eq(users.email, email), isNull(users.deletedAt)),
        });
        if (!user || !user.isActive) return null;

        const matches = await bcrypt.compare(password, user.passwordHash);
        if (!matches) return null;

        await logActivity({
          actor: user,
          entityType: "user",
          entityId: user.id,
          action: "signed_in",
          summary: `${user.name} signed in`,
        });

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
