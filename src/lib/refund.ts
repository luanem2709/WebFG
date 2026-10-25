import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hạn mới sau khi trừ `days` ngày. Không thấp hơn `now`; nếu hạn đã qua sẵn thì giữ nguyên. */
export function computeDeduction(oldExpires: Date | null, days: number, now: Date): Date | null {
  if (!oldExpires) return null;
  if (oldExpires.getTime() <= now.getTime()) return oldExpires;
  const target = new Date(oldExpires.getTime() - days * DAY_MS);
  return target.getTime() < now.getTime() ? now : target;
}

export class OrderStateError extends Error {}

export type ReverseAction = "refund" | "cancel";

const ALLOWED_FROM: Record<ReverseAction, string[]> = {
  refund: ["PAID", "NEED_REVIEW"],
  cancel: ["PAID", "PENDING", "NEED_REVIEW", "EXPIRED"],
};

export interface ReversalPreview {
  orderCode: string;
  customerEmail: string;
  status: string;
  allowed: boolean;
  reason?: string;
  /** Số ngày sẽ trừ (0 nếu đơn chưa từng kích hoạt). */
  days: number;
  currentExpiresAt: Date | null;
  newExpiresAt: Date | null;
  /** Hạn mới = bây giờ (khách hết hạn ngay). */
  expiresNow: boolean;
}

export async function previewReversal(orderId: string, action: ReverseAction): Promise<ReversalPreview> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { package: true } });
  if (!order) throw new OrderStateError("Đơn hàng không tồn tại");
  const allowed = ALLOWED_FROM[action].includes(order.status);
  const base = {
    orderCode: order.orderCode,
    customerEmail: order.customerEmail,
    status: order.status,
    days: 0,
    currentExpiresAt: null as Date | null,
    newExpiresAt: null as Date | null,
    expiresNow: false,
  };
  if (!allowed) {
    return { ...base, allowed: false, reason: `Đơn đang ở trạng thái ${order.status}, không thể ${action === "refund" ? "hoàn tiền" : "hủy"} (có thể đã xử lý rồi)` };
  }
  if (order.status !== "PAID") return { ...base, allowed: true };
  const customer = await prisma.customer.findUnique({ where: { email: order.customerEmail } });
  const current = customer?.expiresAt ?? null;
  const now = new Date();
  const next = computeDeduction(current, order.package.days, now);
  return {
    ...base,
    allowed: true,
    days: order.package.days,
    currentExpiresAt: current,
    newExpiresAt: next,
    expiresNow: Boolean(next && current && current > now && next.getTime() <= now.getTime()),
  };
}

/**
 * Hoàn tiền / hủy đơn. Với đơn PAID mặc định trừ đúng số ngày của gói khỏi hạn khách
 * (không thấp hơn hiện tại). Chạy trong 1 transaction; chặn xử lý 2 lần bằng CAS theo trạng thái.
 */
export async function reverseOrder(opts: {
  orderId: string;
  action: ReverseAction;
  deductDays?: boolean;
  actor: string;
  note?: string;
}) {
  const deduct = opts.deductDays !== false;
  const newStatus = opts.action === "refund" ? "REFUNDED" : "CANCELED";

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: opts.orderId }, include: { package: true } });
    if (!order) throw new OrderStateError("Đơn hàng không tồn tại");
    if (!ALLOWED_FROM[opts.action].includes(order.status)) {
      throw new OrderStateError(`Đơn đang ở trạng thái ${order.status}, không thể ${opts.action === "refund" ? "hoàn tiền" : "hủy"}`);
    }

    // CAS: chỉ chuyển nếu trạng thái vẫn như vừa đọc (chặn hoàn tiền 2 lần song song).
    const now = new Date();
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: newStatus, adminNote: opts.note, ...(opts.action === "refund" ? { refundedAt: now } : {}) },
    });
    if (claimed.count === 0) throw new OrderStateError("Đơn vừa được xử lý bởi thao tác khác");

    let before: Date | null = null;
    let after: Date | null = null;
    let deducted = 0;
    if (order.status === "PAID" && deduct) {
      const customer = await tx.customer.findUnique({ where: { email: order.customerEmail } });
      if (customer?.expiresAt) {
        before = customer.expiresAt;
        after = computeDeduction(before, order.package.days, now);
        deducted = order.package.days;
        await tx.customer.update({
          where: { id: customer.id },
          data: { expiresAt: after, active: Boolean(after && after > now) },
        });
      }
    }
    await tx.order.update({ where: { id: order.id }, data: { refundDaysDeducted: deducted } });

    await tx.transactionLog.create({
      data: {
        type: opts.action === "refund" ? "admin_refund" : "admin_cancel",
        source: "admin",
        status: "success",
        payload: JSON.stringify({
          actor: opts.actor,
          orderCode: order.orderCode,
          previousStatus: order.status,
          deductDays: deduct,
          daysDeducted: deducted,
          expiresBefore: before,
          expiresAfter: after,
          note: opts.note,
        }),
        message: `${opts.actor} ${opts.action === "refund" ? "hoàn tiền" : "hủy"} đơn ${order.orderCode}: ${
          deducted ? `trừ ${deducted} ngày (${before?.toISOString()} → ${after?.toISOString()})` : "không trừ hạn"
        }`,
      },
    });

    return { status: newStatus, daysDeducted: deducted, expiresBefore: before, expiresAfter: after };
  });
}
