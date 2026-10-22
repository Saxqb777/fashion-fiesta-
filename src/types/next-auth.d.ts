import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/db/schema";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: UserRole; practice: boolean; practiceOnly: boolean } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
    practice?: boolean;
    practiceOnly?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: UserRole;
    practice?: boolean;
    practiceOnly?: boolean;
  }
}
