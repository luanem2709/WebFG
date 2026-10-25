import type { Order, Package } from "@prisma/client";

/** Chỉ trả về các trường an toàn cho khách (không có webhookPayload, adminNote). */
export function toPublicOrder(order: Order & { package: Package }) {
  return {
    id: order.id,
    orderCode: order.orderCode,
    amount: order.amount,
    status: order.status,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    expiresAt: order.expiresAt,
    licenseKey: order.licenseKey,
    package: { name: order.package.name, days: order.package.days },
  };
}
