import type { NextFetchEvent, NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// The `authorized` callback in authConfig decides: signed in, or sent to /login.
const handler = auth(() => undefined) as unknown as (
  request: NextRequest,
  event: NextFetchEvent,
) => Promise<Response | undefined>;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return handler(request, event);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\..*).*)"],
};
