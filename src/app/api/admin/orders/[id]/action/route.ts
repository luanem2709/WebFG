import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { activatePaidOrder, ADMIN_ACTIVATABLE } from "@/lib/fulfillment";
import { issueLicenseKey } from "@/lib/keys";
import { OrderStateError, reverseOrder } from "@/lib/refund";
import { z } from "zod";

const actionSchema = z.object({
  action: z.enum(["confirm", "cancel", "complete", "refund", "issue_key"]),
  note: z.string().optional(),
  /** Mặc định true: đơn PAID bị hoàn/hủy sẽ trừ số ngày của gói khỏi hạn khách. */
  deductDays: z.boolean().optional(),
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
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { action, note, deductDays } = parsed.data;

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { package: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Đơn hàng không tồn tại" }, { status: 404 });
    }

    if (action === "issue_key") {
      if (order.status !== "PAID") {
        return NextResponse.json({ error: "Chỉ cấp key cho đơn đã thanh toán" }, { status: 400 });
      }
      const key = await issueLicenseKey(order);
      if (!key) {
        return NextResponse.json({ error: "Không tạo được key, xem Nhật ký" }, { status: 502 });
      }
      return NextResponse.json({ success: true, licenseKey: key });
    }

    if (action === "confirm" || action === "complete") {
      if (!ADMIN_ACTIVATABLE.includes(order.status)) {
        return NextResponse.json(
          { error: `Không thể kích hoạt đơn ở trạng thái ${order.status}` },
          { status: 409 }
        );
      }
      const result = await activatePaidOrder(order.id, order.paidAmount ?? order.amount);
      if (result.status === "already_processed") {
        return NextResponse.json({ error: "Đơn vừa được xử lý bởi thao tác khác" }, { status: 409 });
      }
      await prisma.order.update({ where: { id }, data: { adminNote: note } });
      await prisma.transactionLog.create({
        data: {
          type: "admin_order_action",
          source: "admin",
          status: "success",
          payload: JSON.stringify({ actor: admin, orderCode: order.orderCode, action, previousStatus: order.status }),
          message: `${admin} kích hoạt đơn ${order.orderCode} (từ ${order.status})`,
        },
      });
      return NextResponse.json({ success: true, status: "PAID" });
    }

    const result = await reverseOrder({
      orderId: order.id,
      action: action === "refund" ? "refund" : "cancel",
      deductDays,
      actor: admin,
      note,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    if (err instanceof OrderStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
