import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrderConfirmation } from "@/lib/email";
import { issueLicenseKey } from "@/lib/keys";
import { notifyAdmin, maskEmail } from "@/lib/notify-admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const vnd = (n: number) => `${new Intl.NumberFormat("vi-VN").format(n)}đ`;

export type ActivationResult =
  | { status: "PAID"; expiresAt: Date; licenseKey: string | null }
  | { status: "already_processed"; expiresAt: Date | null; licenseKey: string | null };

export interface TxInfo {
  id: string;
  receivedAt: Date;
}

/** Trạng thái đơn được phép chuyển sang PAID khi admin kích hoạt tay. CANCELED/REFUNDED bị chặn có chủ đích. */
export const ADMIN_ACTIVATABLE = ["PENDING", "NEED_REVIEW", "EXPIRED"];

/**
 * Kích hoạt đơn đã thanh toán. An toàn khi nhiều webhook đến cùng lúc: chỉ một lời gọi
 * "chiếm" được đơn (updateMany có điều kiện trên trạng thái), các lời gọi còn lại nhận already_processed.
 * Thời gian được cộng dồn nếu khách còn hạn.
 */
export async function activatePaidOrder(
  orderId: string,
  paidAmount?: number | null,
  opts: { from?: string[]; tx?: TxInfo } = {}
): Promise<ActivationResult> {
  const now = new Date();
  const from = opts.from ?? ADMIN_ACTIVATABLE;

  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: { in: from } },
    data: {
      status: "PAID",
      paidAt: now,
      reviewReason: null,
      ...(opts.tx ? { paymentTransactionId: opts.tx.id, paymentReceivedAt: opts.tx.receivedAt } : {}),
    },
  });

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { package: true },
  });

  if (claimed.count === 0) {
    return { status: "already_processed", expiresAt: order.expiresAt, licenseKey: order.licenseKey };
  }

  const expiresAt = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { email: order.customerEmail },
      update: {},
      create: { email: order.customerEmail, name: order.customerName },
    });
    const stillActive = Boolean(customer.expiresAt && customer.expiresAt > now);
    const base = stillActive ? customer.expiresAt! : now;
    const newExpires = new Date(base.getTime() + order.package.days * DAY_MS);

    await tx.customer.update({
      where: { id: customer.id },
      data: {
        active: true,
        activatedAt: stillActive && customer.activatedAt ? customer.activatedAt : now,
        expiresAt: newExpires,
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: {
        paidAmount: paidAmount ?? order.paidAmount ?? order.amount,
        activatedAt: now,
        expiresAt: newExpires,
      },
    });
    return newExpires;
  });

  const licenseKey = await issueLicenseKey({ ...order, licenseKey: order.licenseKey });
  await sendOrderConfirmation(
    order.customerEmail,
    order.orderCode,
    order.package.name,
    order.package.days,
    expiresAt,
    licenseKey
  );

  return { status: "PAID", expiresAt, licenseKey };
}

export interface WebhookOutcome {
  httpStatus: number;
  body: Record<string, unknown>;
}

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

async function log(type: string, source: string, status: string, message: string, payload?: unknown) {
  await prisma.transactionLog.create({
    data: { type, source, status, message, payload: payload === undefined ? null : JSON.stringify(payload) },
  });
}

/**
 * Xử lý một giao dịch tiền về đã được adapter xác thực.
 * 1) Ghi PaymentTransaction TRƯỚC (unique gatewayName+transactionId chống trùng/race ở tầng DB).
 * 2) Đối chiếu đơn: đúng PENDING + đúng tiền → kích hoạt; lệch tiền → NEED_REVIEW;
 *    đơn EXPIRED/CANCELED → NEED_REVIEW (trả tiền muộn, KHÔNG tự kích hoạt);
 *    đơn PAID/REFUNDED/NEED_REVIEW nhận thêm tiền → không kích hoạt lần 2, báo admin;
 *    không khớp đơn nào → lưu orderId null, báo admin.
 */
export async function processPaymentWebhook(opts: {
  gateway: string;
  transactionId: string;
  orderCode?: string;
  paidAmount?: number;
  payload: unknown;
}): Promise<WebhookOutcome> {
  const { gateway, transactionId, orderCode, payload } = opts;
  const rawContentHash = createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
  const receivedAt = new Date();

  let txRow;
  try {
    txRow = await prisma.paymentTransaction.create({
      data: {
        gatewayName: gateway,
        transactionId,
        orderCode: orderCode ?? null,
        amount: opts.paidAmount ?? 0,
        rawContentHash,
        receivedAt,
        result: "received",
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      await log("webhook_duplicate", gateway, "success", `Giao dịch ${transactionId} đã xử lý trước đó (duplicate)`);
      return { httpStatus: 200, body: { status: "duplicate", transactionId } };
    }
    throw e;
  }
  const setResult = (result: string, orderId?: string) =>
    prisma.paymentTransaction.update({ where: { id: txRow.id }, data: { result, ...(orderId ? { orderId } : {}) } });

  const order = orderCode
    ? await prisma.order.findUnique({ where: { orderCode }, include: { package: true } })
    : null;

  // ---- Không khớp đơn nào ----
  if (!order) {
    await setResult("unmatched");
    await log("webhook_unmatched", gateway, "failed", `Giao dịch ${transactionId} (${vnd(opts.paidAmount ?? 0)}) không khớp đơn nào`);
    await notifyAdmin({
      type: "unmatched_payment",
      lines: [
        `Cổng: ${gateway}`,
        `Mã giao dịch: ${transactionId}`,
        `Số tiền: ${vnd(opts.paidAmount ?? 0)}`,
        `Mã đơn đọc được: ${orderCode ?? "không có"}`,
      ],
      link: "/admin/logs",
    });
    return { httpStatus: 200, body: { status: "unmatched", transactionId } };
  }

  const paidAmount = opts.paidAmount ?? order.amount;
  const txInfo: TxInfo = { id: transactionId, receivedAt };
  const baseLines = [
    `Mã đơn: ${order.orderCode}`,
    `Khách: ${maskEmail(order.customerEmail)}`,
    `Số tiền nhận: ${vnd(paidAmount)} (đơn ${vnd(order.amount)})`,
    `Mã giao dịch: ${transactionId}`,
  ];

  const extra = async (reason: string): Promise<WebhookOutcome> => {
    await setResult("extra_payment", order.id);
    await log("payment_extra", gateway, "pending", `${reason} — đơn ${order.orderCode}, giao dịch ${transactionId}`, {
      orderCode: order.orderCode,
      paidAmount,
    });
    await notifyAdmin({
      type: "extra_payment",
      lines: [...baseLines, `Trạng thái đơn hiện tại: ${order.status}`, "Không kích hoạt lần 2. Cần hoàn tiền thủ công nếu là chuyển khoản thừa."],
      link: "/admin/orders",
    });
    return { httpStatus: 200, body: { status: "extra_payment", orderCode: order.orderCode } };
  };

  // ---- Đơn đang chờ ----
  if (order.status === "PENDING") {
    if (paidAmount !== order.amount) {
      const c = await prisma.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: {
          status: "NEED_REVIEW",
          reviewReason: "AMOUNT_MISMATCH",
          paidAmount,
          paymentTransactionId: transactionId,
          paymentReceivedAt: receivedAt,
        },
      });
      if (c.count === 0) return extra("Đơn đổi trạng thái đồng thời");
      await setResult("need_review", order.id);
      await log("payment_mismatch", gateway, "pending", `Chênh lệch ${paidAmount - order.amount}đ, cần duyệt tay — ${order.orderCode}`, {
        orderCode: order.orderCode,
        paidAmount,
      });
      await notifyAdmin({
        type: "amount_mismatch",
        lines: [...baseLines, `Chênh lệch: ${vnd(paidAmount - order.amount)}`],
        link: "/admin/orders?status=NEED_REVIEW",
      });
      return { httpStatus: 200, body: { status: "NEED_REVIEW", orderCode: order.orderCode } };
    }

    const result = await activatePaidOrder(order.id, paidAmount, { from: ["PENDING"], tx: txInfo });
    if (result.status === "already_processed") return extra("Đơn đã được xử lý bởi giao dịch khác");
    await setResult("processed", order.id);
    await log("payment_confirmed", gateway, "success", `Thanh toán thành công — ${order.orderCode}`, {
      orderId: order.id,
      orderCode: order.orderCode,
      paidAmount,
    });
    return {
      httpStatus: 200,
      body: { status: "PAID", orderCode: order.orderCode, expiresAt: result.expiresAt, licenseKey: result.licenseKey },
    };
  }

  // ---- Đơn đã hết hạn / bị hủy mà vẫn nhận tiền → trả tiền muộn ----
  if (order.status === "EXPIRED" || order.status === "CANCELED") {
    const c = await prisma.order.updateMany({
      where: { id: order.id, status: { in: ["EXPIRED", "CANCELED"] } },
      data: {
        status: "NEED_REVIEW",
        reviewReason: "LATE_PAYMENT",
        paidAmount,
        paymentTransactionId: transactionId,
        paymentReceivedAt: receivedAt,
      },
    });
    if (c.count === 0) return extra("Đơn đổi trạng thái đồng thời");
    await setResult("late_payment", order.id);
    await log("payment_late", gateway, "pending", `Trả tiền muộn cho đơn ${order.status} ${order.orderCode}, chờ admin duyệt`, {
      orderCode: order.orderCode,
      previousStatus: order.status,
      paidAmount,
    });
    await notifyAdmin({
      type: "late_payment",
      lines: [...baseLines, `Trạng thái trước đó: ${order.status}`, "Chưa kích hoạt. Chọn 'Kích hoạt' hoặc 'Hoàn tiền' trong trang Đơn hàng."],
      link: "/admin/orders?status=NEED_REVIEW",
    });
    return { httpStatus: 200, body: { status: "NEED_REVIEW", reviewReason: "LATE_PAYMENT", orderCode: order.orderCode } };
  }

  // ---- PAID / REFUNDED / NEED_REVIEW nhận thêm tiền ----
  return extra(`Đơn ${order.status} nhận thêm tiền`);
}

/** Ghi nhận webhook sai xác thực; từ 5 lần/10 phút trở lên thì báo admin. */
export async function recordWebhookAuthFailure(source: string): Promise<void> {
  await log("webhook_auth_failed", source, "failed", `Webhook ${source} sai xác thực`);
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const count = await prisma.transactionLog.count({
    where: { type: "webhook_auth_failed", source, createdAt: { gte: since } },
  });
  if (count >= 5) {
    await notifyAdmin({
      type: "webhook_auth_failed",
      lines: [`Cổng: ${source}`, `${count} lần sai xác thực trong 10 phút qua`, "Kiểm tra khóa/secret cấu hình hoặc có người đang dò webhook."],
      link: "/admin/logs",
    });
  }
}
