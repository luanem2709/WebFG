import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ orderId: z.string() });

/** Admin xác nhận đã tự thu hồi key trên sheet (chỉ ẩn khỏi danh sách, KHÔNG sửa sheet). */
export async function POST(req: Request) {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    const order = await prisma.order.update({
      where: { id: parsed.data.orderId },
      data: { revokeAckAt: new Date() },
    });
    await prisma.transactionLog.create({
      data: {
        type: "admin_revoke_ack",
        source: "admin",
        status: "success",
        message: `${admin} xác nhận đã thu hồi key của đơn ${order.orderCode}`,
      },
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
  }
}
