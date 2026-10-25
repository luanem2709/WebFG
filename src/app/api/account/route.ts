import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toPublicOrder } from "@/lib/public-order";
import {
  getCustomerSession,
  clearSessionCookie,
  CUSTOMER_SESSION_COOKIE,
} from "@/lib/auth";

export async function GET() {
  try {
    const email = await getCustomerSession();
    if (!email) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const customer = await prisma.customer.findUnique({ where: { email } });
    const orders = await prisma.order.findMany({
      where: { customerEmail: email },
      include: { package: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      authenticated: true,
      email,
      customer: customer || {
        email,
        name: email,
        active: false,
        activatedAt: null,
        expiresAt: null,
        locked: false,
      },
      orders: orders.map(toPublicOrder),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response.headers, CUSTOMER_SESSION_COOKIE);
  return response;
}
