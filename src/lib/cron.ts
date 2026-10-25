import { prisma } from "@/lib/prisma";
import { sendExpiryReminder } from "@/lib/email";
import { retryMissingKeys } from "@/lib/keys";
import { flushPendingAlerts, notifyAdmin } from "@/lib/notify-admin";

const ORDER_HOLD_KEY = "orderHoldMinutes";
const EXPIRY_REMIND_KEY = "expiryRemindDays";

async function getBusinessValue(key: string, fallback: number): Promise<number> {
  const row = await prisma.config.findUnique({ where: { key } });
  if (row) return parseInt(row.value, 10) || fallback;
  return fallback;
}

export async function expirePendingOrders() {
  const holdMinutes = await getBusinessValue(ORDER_HOLD_KEY, 15);
  const cutoff = new Date(Date.now() - holdMinutes * 60 * 1000);

  const expired = await prisma.order.findMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    include: { package: true },
  });

  for (const order of expired) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "EXPIRED" },
    });

    await prisma.transactionLog.create({
      data: {
        type: "order_expired",
        source: "system",
        payload: JSON.stringify({ orderId: order.id, orderCode: order.orderCode }),
        status: "success",
        message: `Đơn ${order.orderCode} đã hết hạn chờ thanh toán`,
      },
    });
  }

  return expired.length;
}

export async function sendExpiryReminders() {
  const remindDays = await getBusinessValue(EXPIRY_REMIND_KEY, 3);
  const now = new Date();
  const targetStart = new Date(now);
  targetStart.setHours(0, 0, 0, 0);
  const targetEnd = new Date(now);
  targetEnd.setDate(targetEnd.getDate() + remindDays + 1);
  targetEnd.setHours(23, 59, 59, 999);

  const customers = await prisma.customer.findMany({
    where: {
      active: true,
      locked: false,
      expiresAt: { gte: targetStart, lte: targetEnd },
    },
  });

  let sent = 0;
  for (const customer of customers) {
    const diffDays = Math.ceil((customer.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) continue;

    const existing = await prisma.emailLog.findFirst({
      where: {
        to: customer.email,
        type: "expiry_reminder",
        createdAt: { gte: targetStart },
      },
    });
    if (existing) continue;

    await sendExpiryReminder(customer.email, customer.expiresAt!, diffDays);
    sent++;
  }

  return sent;
}

/** Đơn đã PAID quá 10 phút mà vẫn chưa có key → báo admin. */
export async function checkMissingKeys(): Promise<number> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { status: "PAID", licenseKey: null, paidAt: { lte: cutoff } },
    orderBy: { paidAt: "asc" },
    take: 50,
  });
  if (orders.length === 0) return 0;
  await notifyAdmin({
    type: "key_missing",
    lines: [
      `Có ${orders.length} đơn đã thanh toán quá 10 phút nhưng chưa có key`,
      `Mã đơn: ${orders.slice(0, 5).map((o) => o.orderCode).join(", ")}${orders.length > 5 ? ", ..." : ""}`,
    ],
    link: "/admin/keys",
  });
  return orders.length;
}

export async function runCronJobs() {
  const expiredOrders = await expirePendingOrders();
  const remindersSent = await sendExpiryReminders();
  const keys = await retryMissingKeys();
  const keysMissing = await checkMissingKeys();
  const alertsFlushed = await flushPendingAlerts();
  return {
    expiredOrders,
    remindersSent,
    keysRetried: keys.attempted,
    keysIssued: keys.issued,
    keysMissing,
    alertsFlushed,
  };
}
