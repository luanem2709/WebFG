import { NextResponse } from "next/server";
import { verifyMagicLink, setSessionCookie, CUSTOMER_SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await verifyMagicLink(token);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL("/account", req.url));
  setSessionCookie(response.headers, CUSTOMER_SESSION_COOKIE, result.email!, 24 * 60 * 60);
  return response;
}
