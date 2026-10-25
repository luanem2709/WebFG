import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { z } from "zod";

const adjustSchema = z.object({
  days: z.number(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const { id } = await params;
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      return NextResponse.json({ error: "Khách hàng không tồn tại" }, { status: 404 });
    }

    const now = new Date();
    const currentExpires = customer.expiresAt || now;
    const base = currentExpires > now ? currentExpires : now;
    const newExpires = new Date(base.getTime() + parsed.data.days * 24 * 60 * 60 * 1000);

    await prisma.customer.update({
      where: { id },
      data: {
        expiresAt: newExpires,
        active: newExpires > now,
        activatedAt: customer.activatedAt || now,
      },
    });

    await prisma.transactionLog.create({
      data: {
        type: "admin_adjust_days",
        source: "admin",
        payload: JSON.stringify({
          customerId: customer.id,
          email: customer.email,
          days: parsed.data.days,
          newExpires,
        }),
        status: "success",
        message: `Admin cộng/trừ ${parsed.data.days} ngày cho ${customer.email}`,
      },
    });

    return NextResponse.json({ success: true, expiresAt: newExpires });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
