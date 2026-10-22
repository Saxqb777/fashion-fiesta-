import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

// Must match MODE_HEADER in src/db. Kept literal so the proxy never loads the database client.
const MODE_HEADER = "x-ff-db";

// The `authorized` callback in authConfig decides first: signed in, or sent to /login.
// Then the database for this request is chosen from the signed session, never from the browser.
const handler = auth((request) => {
  const headers = new Headers(request.headers);
  headers.delete(MODE_HEADER);
  if (request.auth?.user?.practice) headers.set(MODE_HEADER, "practice");
  return NextResponse.next({ request: { headers } });
}) as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response | undefined>;

export function proxy(request: NextRequest, event: NextFetchEvent) {
  return handler(request, event);
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|.*\\..*).*)"],
};
