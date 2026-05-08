import { NextRequest, NextResponse } from "next/server";

const protectedPaths = ["/profile", "/routes/builder"];
const sessionCookieNames = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected) {
    const sessionToken = sessionCookieNames
      .map((name) => req.cookies.get(name)?.value)
      .find(Boolean);

    if (!sessionToken) {
      const loginUrl = new URL("/login", req.url);
      const callbackUrl = `${pathname}${req.nextUrl.search}`;
      loginUrl.searchParams.set("callbackUrl", callbackUrl);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/profile/:path*", "/routes/builder/:path*"],
};
