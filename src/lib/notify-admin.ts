import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { sendEmail } from "@/lib/email";

export type AlertType =
  | "need_review"
  | "late_payment"
  | "amount_mismatch"
  | "unmatched_payment"
  | "extra_payment"
  | "key_failed"
  | "key_retry_exhausted"
  | "key_missing"
  | "webhook_auth_failed"
  | "customer_email_failed";

const TITLES: Record<AlertType, string> = {
  need_review: "Đơn cần duyệt tay",
  late_payment: "Đơn trả tiền muộn (cần duyệt)",
  amount_mismatch: "Đơn lệch số tiền (cần duyệt)",
  unmatched_payment: "Giao dịch không khớp đơn nào",
  extra_payment: "Đơn đã xử lý nhưng nhận thêm tiền",
  key_failed: "Cấp key thất bại",
  key_retry_exhausted: "Cấp key thất bại nhiều lần",
  key_missing: "Đơn đã trả tiền nhưng chưa có key",
  webhook_auth_failed: "Webhook sai xác thực nhiều lần",
  customer_email_failed: "Gửi email cho khách thất bại",
};

export interface AdminEvent {
  type: AlertType;
  /** Mỗi dòng là một thông tin ngắn (mã đơn, số tiền, lý do...). KHÔNG đưa key/API key/mật khẩu vào đây. */
  lines: string[];
  /** Đường dẫn trang admin, ví dụ /admin/orders?status=NEED_REVIEW */
  link?: string;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  return `${name.slice(0, 1)}***@${domain}`;
}

/** Lớp bảo vệ cuối cùng: che email, key và API key nếu lỡ lọt vào nội dung. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m))
    .replace(/\bFG(?:-[A-Z0-9]+){2,}\b/g, "[key]")
    .replace(/Apikey\s+\S+/gi, "[redacted]")
    .replace(/(secret|token|password|pass)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function channelsConfigured(): boolean {
  const a = getConfig().alerts;
  return Boolean(a.email || (a.telegramToken && a.telegramChatId));
}

async function sendToChannels(subject: string, body: string): Promise<void> {
  const a = getConfig().alerts;
  const results: string[] = [];

  if (a.email) {
    const html = `<pre style="font-family:system-ui,sans-serif;font-size:14px;white-space:pre-wrap">${body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</pre>`;
    const r = await sendEmail({ to: a.email, type: "admin_alert", subject, html, text: body });
    results.push(r.success ? "email:ok" : `email:${r.error}`);
  }
  if (a.telegramToken && a.telegramChatId) {
    const base = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
    try {
      const res = await fetch(`${base}/bot${a.telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: a.telegramChatId, text: `${subject}\n\n${body}`, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
      results.push(res.ok ? "telegram:ok" : `telegram:${res.status}`);
    } catch (e) {
      results.push(`telegram:${e instanceof Error ? e.message : "error"}`);
    }
  }
  if (results.some((r) => !r.endsWith(":ok"))) {
    await prisma.transactionLog.create({
      data: {
        type: "admin_alert_delivery",
        source: "system",
        status: "failed",
        message: `Gửi thông báo admin lỗi: ${results.join(", ")}`,
      },
    });
  }
}

function buildBody(type: AlertType, lines: string[], link: string | undefined, suppressed: number, summary: string | null): string {
  const parts = [...lines];
  if (suppressed > 0) {
    parts.push("", `(+${suppressed} sự kiện cùng loại trong 5 phút qua)`);
    if (summary) parts.push(...summary.split("\n").map((l) => `  • ${l}`));
  }
  if (link) parts.push("", `Xem: ${getConfig().nextauthUrl}${link}`);
  return scrub(parts.join("\n"));
}

/**
 * Gửi cảnh báo cho admin (email + Telegram, tùy cấu hình). Gộp cùng loại trong 5 phút thành 1 thông báo,
 * mốc lưu trong DB (AlertState). Không bao giờ throw: lỗi chỉ được ghi nhật ký.
 */
export async function notifyAdmin(ev: AdminEvent): Promise<"sent" | "suppressed" | "skipped"> {
  try {
    if (!channelsConfigured()) return "skipped";
    const now = new Date();
    const windowMs = getConfig().alerts.windowMs;
    const windowStart = new Date(now.getTime() - windowMs);
    const oneLine = scrub(ev.lines.join(" | "));

    // Thử "chiếm" cửa sổ gửi: chỉ 1 tiến trình thắng nhờ điều kiện lastSentAt trong UPDATE.
    let claimed = (
      await prisma.alertState.updateMany({
        where: { type: ev.type, lastSentAt: { lte: windowStart } },
        data: { lastSentAt: now },
      })
    ).count;

    if (claimed === 0) {
      const existing = await prisma.alertState.findUnique({ where: { type: ev.type } });
      if (!existing) {
        try {
          await prisma.alertState.create({ data: { type: ev.type, lastSentAt: now } });
          claimed = 1;
        } catch {
          // đua tạo bản ghi: coi như đã có người gửi → gộp
        }
      }
    }

    if (claimed === 0) {
      const st = await prisma.alertState.findUnique({ where: { type: ev.type } });
      const lines = [...(st?.pendingSummary ? st.pendingSummary.split("\n") : []), oneLine].slice(-5);
      await prisma.alertState.update({
        where: { type: ev.type },
        data: { pendingCount: { increment: 1 }, pendingSummary: lines.join("\n") },
      });
      return "suppressed";
    }

    const st = await prisma.alertState.findUnique({ where: { type: ev.type } });
    const suppressed = st?.pendingCount ?? 0;
    const summary = st?.pendingSummary ?? null;
    if (suppressed > 0) {
      await prisma.alertState.update({ where: { type: ev.type }, data: { pendingCount: 0, pendingSummary: null } });
    }
    await sendToChannels(`[funnygame] ${TITLES[ev.type]}`, buildBody(ev.type, ev.lines, ev.link, suppressed, summary));
    return "sent";
  } catch (e) {
    await logAlertFailure(e);
    return "skipped";
  }
}

/** Cron: gửi bản tóm tắt cho các loại có sự kiện bị gộp mà cửa sổ đã qua. */
export async function flushPendingAlerts(): Promise<number> {
  let sent = 0;
  try {
    if (!channelsConfigured()) return 0;
    const now = new Date();
    const windowStart = new Date(now.getTime() - getConfig().alerts.windowMs);
    const due = await prisma.alertState.findMany({ where: { pendingCount: { gt: 0 }, lastSentAt: { lte: windowStart } } });
    for (const st of due) {
      const claimed = await prisma.alertState.updateMany({
        where: { type: st.type, lastSentAt: { lte: windowStart }, pendingCount: { gt: 0 } },
        data: { lastSentAt: now, pendingCount: 0, pendingSummary: null },
      });
      if (claimed.count === 0) continue;
      const type = st.type as AlertType;
      await sendToChannels(
        `[funnygame] ${TITLES[type] ?? st.type} (tổng hợp)`,
        buildBody(type, [`Có ${st.pendingCount} sự kiện trong 5 phút trước, chưa gửi riêng.`], undefined, 0, st.pendingSummary)
      );
      sent++;
    }
  } catch (e) {
    await logAlertFailure(e);
  }
  return sent;
}

async function logAlertFailure(e: unknown) {
  try {
    await prisma.transactionLog.create({
      data: {
        type: "admin_alert_error",
        source: "system",
        status: "failed",
        message: `Lỗi module thông báo admin: ${e instanceof Error ? e.message : "unknown"}`,
      },
    });
  } catch {
    /* không được làm hỏng luồng chính */
  }
}
