import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/db/schema";

/** Shared config without providers. Safe to use in the proxy. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  providers: [],
  logger: {
    // A wrong password is normal use, not a server error.
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(error);
    },
  },
  callbacks: {
    authorized({ auth, request }) {
      const loggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/login")) {
        return loggedIn ? Response.redirect(new URL("/today", request.nextUrl)) : true;
      }
      return loggedIn;
    },
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.name = user.name;
        token.email = user.email;
      }
      if (trigger === "update" && session?.user) {
        token.name = session.user.name ?? token.name;
        token.email = session.user.email ?? token.email;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = (token.id as string | undefined) ?? "";
      session.user.role = (token.role as UserRole | undefined) ?? "tailor";
      session.user.name = token.name ?? session.user.name;
      session.user.email = token.email ?? session.user.email;
      return session;
    },
  },
} satisfies NextAuthConfig;
