import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional password protection (HTTP Basic Auth) for the whole site, including the data endpoint.
 *
 * Off by default. To turn it on, set these in Vercel → Project → Settings → Environment Variables
 * (then redeploy):
 *   SITE_PASSWORD = <password>        required to enable protection
 *   SITE_USER     = <username>        optional, defaults to "admin"
 */
export function proxy(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.SITE_USER || "admin";

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const i = decoded.indexOf(":");
      if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), password)) {
        return NextResponse.next();
      }
    } catch {
      /* malformed header — fall through to 401 */
    }
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Blockchain Engineer Finder", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
