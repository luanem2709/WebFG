import { prisma } from "@/lib/prisma";
import { sendLicenseKeyEmail } from "@/lib/email";
import { maskEmail, notifyAdmin } from "@/lib/notify-admin";
import { isSheetConfigured } from "@/lib/google-sheets";
import { issueKeyToSheet } from "@/lib/license-sheet";
import { defaultKeyFormat, generateKey } from "@/lib/license-schema";

const MAX_KEY_ATTEMPTS = 4;

interface OrderForKey {
  id: string;
  orderCode: string;
  customerEmail: string;
  licenseKey: string | null;
  package: { days: number; name: string };
}

/** Key local chỉ dùng khi dev (chưa cấu hình Google Sheet) — KHÔNG hợp lệ với ứng dụng đọc sheet. */
function allowLocalKeys(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_KEYS === "true";
}

/**
 * Tạo key cho đơn đã thanh toán và ghi vào Google Sheet (tab LicenseKeys).
 * Idempotent theo mã đơn. Không throw: lỗi được ghi vào Nhật ký, cron sẽ thử lại.
 */
export async function issueLicenseKey(order: OrderForKey): Promise<string | null> {
  if (order.licenseKey) return order.licenseKey;

  try {
    let key: string;
    let source: string;
    let message: string;

    if (isSheetConfigured()) {
      const issued = await issueKeyToSheet({
        orderCode: order.orderCode,
        email: order.customerEmail,
        days: order.package.days,
      });
      key = issued.key;
      source = "google_sheet";
      message = issued.reused
        ? `Dùng lại key ${key} đã có trên sheet (dòng ${issued.row}) cho ${order.orderCode}`
        : `Đã ghi key ${key} vào sheet (dòng ${issued.row}) cho ${order.orderCode}`;
    } else if (allowLocalKeys()) {
      key = generateKey(defaultKeyFormat(order.package.days));
      source = "local";
      message = `Key ${key} chỉ lưu local (chưa cấu hình Google Sheet) cho ${order.orderCode}`;
    } else {
      throw new Error("Chưa cấu hình Google Sheet (GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON)");
    }

    // Chỉ gán key cho đơn nếu đơn chưa có (tránh ghi đè khi 2 tiến trình chạy song song).
    const saved = await prisma.order.updateMany({
      where: { id: order.id, licenseKey: null },
      data: { licenseKey: key },
    });
    if (saved.count === 0) {
      const current = await prisma.order.findUnique({ where: { id: order.id } });
      return current?.licenseKey ?? key;
    }

    await prisma.transactionLog.create({
      data: {
        type: "license_key_issued",
        source,
        payload: JSON.stringify({ orderCode: order.orderCode, key }),
        status: "success",
        message,
      },
    });
    return key;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.transactionLog.create({
      data: {
        type: "license_key_failed",
        source: "google_sheet",
        payload: JSON.stringify({ orderCode: order.orderCode }),
        status: "failed",
        message: `Không tạo được key cho ${order.orderCode}: ${message}`,
      },
    });
    await notifyAdmin({
      type: "key_failed",
      lines: [`Mã đơn: ${order.orderCode}`, `Khách: ${maskEmail(order.customerEmail)}`, `Lý do: ${message}`],
      link: "/admin/keys",
    });
    return null;
  }
}

/** Cron: cấp lại key cho các đơn đã thanh toán nhưng chưa có key (do Google lỗi), rồi gửi email key. */
export async function retryMissingKeys(): Promise<{ attempted: number; issued: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: { status: "PAID", licenseKey: null, paidAt: { gte: since } },
    include: { package: true },
    take: 20,
    orderBy: { paidAt: "asc" },
  });

  let issued = 0;
  for (const order of orders) {
    const key = await issueLicenseKey(order);
    if (!key) {
      const failures = await prisma.transactionLog.count({
        where: { type: "license_key_failed", payload: { contains: order.orderCode } },
      });
      if (failures >= MAX_KEY_ATTEMPTS) {
        await notifyAdmin({
          type: "key_retry_exhausted",
          lines: [`Mã đơn: ${order.orderCode}`, `Khách: ${maskEmail(order.customerEmail)}`, `Đã thử ${failures} lần, vẫn chưa cấp được key`],
          link: "/admin/keys",
        });
      }
    }
    if (key) {
      issued++;
      await sendLicenseKeyEmail(order.customerEmail, order.orderCode, key, order.package.name, order.expiresAt);
    }
  }
  return { attempted: orders.length, issued };
}
