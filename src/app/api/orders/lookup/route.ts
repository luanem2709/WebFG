import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toPublicOrder } from "@/lib/public-order";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email")?.trim();
  const code = searchParams.get("code")?.trim();

  if (!email || !code) {
    return NextResponse.json({ error: "Vui lòng nhập đầy đủ email và mã đơn hàng" }, { status: 400 });
  }

  try {
    const order = await prisma.order.findFirst({
      where: { customerEmail: email, orderCode: code },
      include: { package: true },
    });
    if (!order) {
      return NextResponse.json(
        { error: "Không tìm thấy đơn hàng với email và mã đơn này" },
        { status: 404 }
      );
    }

    const customer = await prisma.customer.findUnique({ where: { email } });
    const orders = await prisma.order.findMany({
      where: { customerEmail: email },
      include: { package: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      order: toPublicOrder(order),
      customer,
      orders: orders.map(toPublicOrder),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
