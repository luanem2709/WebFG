import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { package: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Đơn hàng không tồn tại" }, { status: 404 });
    }
    return NextResponse.json({
      id: order.id,
      orderCode: order.orderCode,
      status: order.status,
      amount: order.amount,
      expiresAt: order.expiresAt,
      licenseKey: order.licenseKey,
      package: { name: order.package.name, days: order.package.days },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
