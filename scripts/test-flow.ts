/**
 * Test luồng nghiệp vụ (không cần mạng thật): DB SQLite tạm + Telegram giả + gateway mock/adapter + Google API lỗi giả.
 * Chạy: npm run test:flow
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";

const dbPath = path.join(process.cwd(), "prisma", "test-flow.db");
for (const f of [dbPath, `${dbPath}-journal`]) fs.rmSync(f, { force: true });

// --- Telegram giả: đếm và lưu nội dung các tin nhắn ---
const telegram: string[] = [];
const tgServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    telegram.push((JSON.parse(body) as { text: string }).text);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

let passed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

async function main() {
  await new Promise<void>((r) => tgServer.listen(0, "127.0.0.1", r));
  const tgPort = (tgServer.address() as AddressInfo).port;

  process.env.DATABASE_URL = "file:./test-flow.db";
  process.env.ADMIN_ALERT_EMAIL = "admin@example.com";
  process.env.TELEGRAM_BOT_TOKEN = "TESTTOKEN";
  process.env.TELEGRAM_CHAT_ID = "42";
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${tgPort}`;
  process.env.SEPAY_API_KEY = "sepay-test-key";
  process.env.EMAIL_DEV_LOG = "true";
  delete process.env.GOOGLE_SHEET_ID;
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  execSync("npx prisma migrate deploy", { env: process.env, stdio: "pipe" });

  const { prisma } = await import("@/lib/prisma");
  const { getConfig } = await import("@/lib/config");
  const { processPaymentWebhook, activatePaidOrder, recordWebhookAuthFailure } = await import("@/lib/fulfillment");
  const { reverseOrder, computeDeduction, OrderStateError } = await import("@/lib/refund");
  const { notifyAdmin, flushPendingAlerts } = await import("@/lib/notify-admin");
  const { SePayAdapter } = await import("@/lib/payment/adapter");
  const { issueLicenseKey, retryMissingKeys } = await import("@/lib/keys");
  const { checkMissingKeys } = await import("@/lib/cron");
  const { sendEmail, resetTransporterForTests } = await import("@/lib/email");

  const DAY = 24 * 60 * 60 * 1000;
  await prisma.package.createMany({
    data: [
      { id: "p1", name: "Gói 1 tháng", days: 30, price: 300000 },
      { id: "p3", name: "Gói 3 tháng", days: 90, price: 750000 },
    ],
  });

  let seq = 0;
  const newOrder = async (email: string, status = "PENDING", pkg: "p1" | "p3" = "p1", extra: Record<string, unknown> = {}) =>
    prisma.order.create({
      data: {
        orderCode: `FGTEST${String(++seq).padStart(6, "0")}`,
        packageId: pkg,
        customerEmail: email,
        amount: pkg === "p1" ? 300000 : 750000,
        status,
        ...extra,
      },
    });
  const hook = (orderCode: string | undefined, tx: string, amount: number, gateway = "sepay") =>
    processPaymentWebhook({ gateway, transactionId: tx, orderCode, paidAmount: amount, payload: { tx, orderCode, amount } });
  const near = (a: Date | null, b: number, tolMs = 60_000) => Boolean(a && Math.abs(a.getTime() - b) < tolMs);
  const tgCount = (needle: string) => telegram.filter((t) => t.includes(needle)).length;

  console.log("\nTest nghiệp vụ nhóm B");

  // ---------- 0. Email khách thất bại → báo admin ----------
  await step("gửi email khách thất bại → báo admin (không ném lỗi)", async () => {
    const cfg = getConfig();
    cfg.email.devLog = false;
    cfg.email.smtpHost = "127.0.0.1";
    cfg.email.smtpPort = 1; // cổng đóng → lỗi kết nối
    resetTransporterForTests();
    const r = await sendEmail({ to: "khach@example.com", subject: "x", html: "x", type: "order_confirm" });
    assert.equal(r.success, false);
    assert.ok(tgCount("Gửi email cho khách thất bại") >= 1);
    assert.ok(!telegram.some((t) => t.includes("khach@example.com")), "email khách phải được che");
    cfg.email.devLog = true;
    resetTransporterForTests();
  });

  // ---------- 1. Trả tiền muộn ----------
  const late = await newOrder("late@example.com", "EXPIRED");
  await step("EXPIRED + tiền về → NEED_REVIEW, không tự kích hoạt, lưu tiền/mã GD/thời điểm", async () => {
    const out = await hook(late.orderCode, "TX-LATE-1", 300000);
    assert.equal(out.body.status, "NEED_REVIEW");
    assert.equal(out.body.reviewReason, "LATE_PAYMENT");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: late.id } });
    assert.equal(o.status, "NEED_REVIEW");
    assert.equal(o.reviewReason, "LATE_PAYMENT");
    assert.equal(o.paidAmount, 300000);
    assert.equal(o.paymentTransactionId, "TX-LATE-1");
    assert.ok(o.paymentReceivedAt);
    assert.equal(o.licenseKey, null);
    const c = await prisma.customer.findUnique({ where: { email: "late@example.com" } });
    assert.ok(!c || !c.expiresAt, "khách chưa được cộng hạn");
    const tx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { gatewayName_transactionId: { gatewayName: "sepay", transactionId: "TX-LATE-1" } } });
    assert.equal(tx.result, "late_payment");
    assert.equal(tx.orderId, late.id);
    assert.ok(await prisma.transactionLog.findFirst({ where: { type: "payment_late" } }));
    assert.equal(tgCount("Đơn trả tiền muộn"), 1);
  });

  const canceled = await newOrder("cancel@example.com", "CANCELED");
  await step("CANCELED + tiền về → cũng NEED_REVIEW (trả tiền muộn)", async () => {
    const out = await hook(canceled.orderCode, "TX-LATE-2", 300000);
    assert.equal(out.body.reviewReason, "LATE_PAYMENT");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: canceled.id } })).status, "NEED_REVIEW");
  });

  await step("admin 'Kích hoạt' đơn trả muộn → luồng fulfillment bình thường (cộng hạn + key)", async () => {
    const r = await activatePaidOrder(late.id, 300000);
    assert.equal(r.status, "PAID");
    const o = await prisma.order.findUniqueOrThrow({ where: { id: late.id } });
    assert.equal(o.status, "PAID");
    assert.equal(o.reviewReason, null);
    assert.ok(o.licenseKey);
    const c = await prisma.customer.findUniqueOrThrow({ where: { email: "late@example.com" } });
    assert.ok(near(c.expiresAt, Date.now() + 30 * DAY));
  });

  await step("admin 'Hoàn tiền' đơn trả muộn → REFUNDED, không trừ hạn; chặn hoàn lần 2", async () => {
    const r = await reverseOrder({ orderId: canceled.id, action: "refund", actor: "admin" });
    assert.equal(r.status, "REFUNDED");
    assert.equal(r.daysDeducted, 0);
    await assert.rejects(reverseOrder({ orderId: canceled.id, action: "refund", actor: "admin" }), OrderStateError);
  });

  await step("đơn CANCELED/REFUNDED không kích hoạt được bằng tay (chặn có chủ đích)", async () => {
    const r = await activatePaidOrder(canceled.id, 300000);
    assert.equal(r.status, "already_processed");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: canceled.id } })).status, "REFUNDED");
  });

  // ---------- Nhận thêm tiền ----------
  await step("đơn PAID nhận thêm tiền → không kích hoạt lần 2, ghi log và báo admin", async () => {
    const before = await prisma.customer.findUniqueOrThrow({ where: { email: "late@example.com" } });
    const key = (await prisma.order.findUniqueOrThrow({ where: { id: late.id } })).licenseKey;
    const out = await hook(late.orderCode, "TX-EXTRA-1", 300000);
    assert.equal(out.body.status, "extra_payment");
    const after = await prisma.customer.findUniqueOrThrow({ where: { email: "late@example.com" } });
    assert.equal(after.expiresAt!.getTime(), before.expiresAt!.getTime());
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: late.id } })).licenseKey, key);
    assert.ok(await prisma.transactionLog.findFirst({ where: { type: "payment_extra" } }));
    assert.equal(tgCount("nhận thêm tiền"), 1);
  });
  await step("đơn REFUNDED nhận thêm tiền → báo admin, vẫn REFUNDED", async () => {
    const out = await hook(canceled.orderCode, "TX-EXTRA-2", 300000);
    assert.equal(out.body.status, "extra_payment");
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: canceled.id } })).status, "REFUNDED");
  });

  // ---------- 2. Chống trùng theo mã giao dịch ----------
  await step("4 webhook trùng transactionId cùng lúc → chỉ 1 được xử lý (unique constraint DB)", async () => {
    const o = await newOrder("dup@example.com");
    const results = await Promise.all([1, 2, 3, 4].map(() => hook(o.orderCode, "TX-DUP-1", 300000)));
    const statuses = results.map((r) => r.body.status as string).sort();
    assert.deepEqual(statuses, ["PAID", "duplicate", "duplicate", "duplicate"]);
    assert.equal(await prisma.paymentTransaction.count({ where: { gatewayName: "sepay", transactionId: "TX-DUP-1" } }), 1);
    const c = await prisma.customer.findUniqueOrThrow({ where: { email: "dup@example.com" } });
    assert.ok(near(c.expiresAt, Date.now() + 30 * DAY), "hạn chỉ cộng một lần");
    assert.equal(await prisma.transactionLog.count({ where: { type: "webhook_duplicate", message: { contains: "TX-DUP-1" } } }), 3);
    // webhook gửi lại sau đó vẫn bị bỏ qua
    assert.equal((await hook(o.orderCode, "TX-DUP-1", 300000)).body.status, "duplicate");
  });

  await step("cùng transactionId nhưng khác cổng là hai giao dịch khác nhau", async () => {
    const o = await newOrder("gw@example.com");
    assert.equal((await hook(o.orderCode, "TX-SAME", 300000, "sepay")).body.status, "PAID");
    const out = await hook(o.orderCode, "TX-SAME", 300000, "casso");
    assert.equal(out.body.status, "extra_payment");
  });

  await step("giao dịch không khớp đơn nào → lưu orderId null và báo admin", async () => {
    const out = await hook("FGKHONGCOTHAT99", "TX-NOMATCH-1", 123000);
    assert.equal(out.body.status, "unmatched");
    const tx = await prisma.paymentTransaction.findUniqueOrThrow({ where: { gatewayName_transactionId: { gatewayName: "sepay", transactionId: "TX-NOMATCH-1" } } });
    assert.equal(tx.orderId, null);
    assert.equal(tx.result, "unmatched");
    assert.equal(tx.amount, 123000);
    assert.equal(tx.rawContentHash.length, 64);
    assert.equal(tgCount("Giao dịch không khớp đơn nào"), 1);
    const noCode = await hook(undefined, "TX-NOMATCH-2", 5000);
    assert.equal(noCode.body.status, "unmatched");
  });

  await step("lệch tiền → NEED_REVIEW (AMOUNT_MISMATCH), không kích hoạt", async () => {
    const o = await newOrder("short@example.com");
    const out = await hook(o.orderCode, "TX-SHORT-1", 250000);
    assert.equal(out.body.status, "NEED_REVIEW");
    const row = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    assert.equal(row.reviewReason, "AMOUNT_MISMATCH");
    assert.equal(row.paidAmount, 250000);
    assert.equal(tgCount("Đơn lệch số tiền"), 1);
  });

  await step("adapter SePay: xác thực khóa, đọc mã đơn từ nội dung, bỏ qua tiền ra", async () => {
    const a = new SePayAdapter("sepay-test-key", "", "");
    const bad = await a.verify({ id: 1, content: "FGABCDEFGH12" }, "Apikey wrong");
    assert.equal(bad.authFailed, true);
    const ok = await a.verify({ id: 99, content: "CK FGABCDEFGH12 tien", transferType: "in", transferAmount: 300000 }, "Apikey sepay-test-key");
    assert.deepEqual([ok.success, ok.orderCode, ok.transactionId, ok.paidAmount], [true, "FGABCDEFGH12", "99", 300000]);
    const out = await a.verify({ id: 100, content: "x", transferType: "out" }, "Apikey sepay-test-key");
    assert.equal(out.ignored, true);
  });

  await step("webhook sai xác thực ≥ 5 lần → báo admin", async () => {
    for (let i = 0; i < 4; i++) await recordWebhookAuthFailure("sepay");
    assert.equal(tgCount("Webhook sai xác thực"), 0);
    await recordWebhookAuthFailure("sepay");
    assert.equal(tgCount("Webhook sai xác thực"), 1);
  });

  // ---------- 3. Hoàn tiền / hủy trừ hạn ----------
  await step("computeDeduction: trừ đúng, không thấp hơn hiện tại, hạn đã qua giữ nguyên", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const d = (days: number) => new Date(now.getTime() + days * DAY);
    assert.equal(computeDeduction(d(60), 30, now)!.getTime(), d(30).getTime());
    assert.equal(computeDeduction(d(10), 30, now)!.getTime(), now.getTime()); // trừ quá → = bây giờ
    assert.equal(computeDeduction(d(-5), 30, now)!.getTime(), d(-5).getTime()); // đã hết hạn → giữ
    assert.equal(computeDeduction(null, 30, now), null);
  });

  await step("hoàn tiền đơn PAID trừ đúng số ngày của gói; chặn hoàn 2 lần (kể cả song song)", async () => {
    const o1 = await newOrder("refund@example.com");
    const o2 = await newOrder("refund@example.com", "PENDING", "p3");
    await hook(o1.orderCode, "TX-R1", 300000);
    await hook(o2.orderCode, "TX-R2", 750000);
    const before = await prisma.customer.findUniqueOrThrow({ where: { email: "refund@example.com" } });
    assert.ok(near(before.expiresAt, Date.now() + 120 * DAY));

    const settled = await Promise.allSettled([
      reverseOrder({ orderId: o1.id, action: "refund", actor: "admin1" }),
      reverseOrder({ orderId: o1.id, action: "refund", actor: "admin2" }),
    ]);
    assert.equal(settled.filter((s) => s.status === "fulfilled").length, 1);
    assert.equal(settled.filter((s) => s.status === "rejected").length, 1);

    const after = await prisma.customer.findUniqueOrThrow({ where: { email: "refund@example.com" } });
    assert.equal(before.expiresAt!.getTime() - after.expiresAt!.getTime(), 30 * DAY);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: o1.id } });
    assert.equal(row.status, "REFUNDED");
    assert.equal(row.refundDaysDeducted, 30);
    const log = await prisma.transactionLog.findFirstOrThrow({ where: { type: "admin_refund", message: { contains: o1.orderCode } } });
    const p = JSON.parse(log.payload!);
    assert.ok(p.actor.startsWith("admin") && p.daysDeducted === 30 && p.expiresBefore && p.expiresAfter);
  });

  await step("hủy đơn PAID trừ quá hạn → hạn = bây giờ (hết hạn)", async () => {
    const o = await newOrder("over@example.com", "PAID", "p1", { paidAt: new Date() });
    await prisma.customer.create({ data: { email: "over@example.com", active: true, expiresAt: new Date(Date.now() + 10 * DAY) } });
    const r = await reverseOrder({ orderId: o.id, action: "cancel", actor: "admin" });
    assert.equal(r.status, "CANCELED");
    const c = await prisma.customer.findUniqueOrThrow({ where: { email: "over@example.com" } });
    assert.ok(near(c.expiresAt, Date.now(), 5000));
    assert.equal(c.active, false);
  });

  await step("checkbox 'Không trừ hạn' → giữ nguyên hạn; khách đã hết hạn không bị đổi", async () => {
    const keep = await newOrder("keep@example.com", "PAID");
    const exp = new Date(Date.now() + 50 * DAY);
    await prisma.customer.create({ data: { email: "keep@example.com", active: true, expiresAt: exp } });
    const r = await reverseOrder({ orderId: keep.id, action: "refund", deductDays: false, actor: "admin" });
    assert.equal(r.daysDeducted, 0);
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { email: "keep@example.com" } })).expiresAt!.getTime(), exp.getTime());

    const old = await newOrder("old@example.com", "PAID");
    const past = new Date(Date.now() - 5 * DAY);
    await prisma.customer.create({ data: { email: "old@example.com", active: false, expiresAt: past } });
    await reverseOrder({ orderId: old.id, action: "refund", actor: "admin" });
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { email: "old@example.com" } })).expiresAt!.getTime(), past.getTime());
  });

  // ---------- 5. Thông báo admin ----------
  await step("gộp cùng loại trong 5 phút thành 1 thông báo; mốc lưu trong DB", async () => {
    const base = telegram.length;
    const emailsBefore = await prisma.emailLog.count({ where: { type: "admin_alert" } });
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await notifyAdmin({ type: "need_review", lines: [`Mã đơn: FGX${i}`, "Khách: customer@example.com", "Key: FG-AB12-CD34-EF56"], link: "/admin/orders" }));
    }
    assert.deepEqual(results, ["sent", "suppressed", "suppressed", "suppressed", "suppressed"]);
    assert.equal(telegram.length - base, 1);
    assert.equal((await prisma.emailLog.count({ where: { type: "admin_alert" } })) - emailsBefore, 1);
    const st = await prisma.alertState.findUniqueOrThrow({ where: { type: "need_review" } });
    assert.equal(st.pendingCount, 4);

    // nội dung không lộ email/key
    const msg = telegram[telegram.length - 1];
    assert.ok(msg.includes("c***@example.com"));
    assert.ok(msg.includes("[key]"));
    assert.ok(!msg.includes("customer@example.com") && !msg.includes("FG-AB12-CD34-EF56"));
    assert.ok(msg.includes("/admin/orders"));

    // loại khác không bị gộp chung
    assert.equal(await notifyAdmin({ type: "unmatched_payment", lines: ["x"] }), "suppressed"); // đã gửi ở test trước
    assert.equal(await notifyAdmin({ type: "key_failed", lines: ["y"] }), "sent");
  });

  await step("hết cửa sổ 5 phút → gửi lại kèm số sự kiện đã gộp; cron flush gửi bản tổng hợp", async () => {
    await prisma.alertState.update({ where: { type: "need_review" }, data: { lastSentAt: new Date(Date.now() - 6 * 60 * 1000) } });
    const before = telegram.length;
    assert.equal(await notifyAdmin({ type: "need_review", lines: ["Mã đơn: FGLAST"] }), "sent");
    assert.equal(telegram.length - before, 1);
    assert.ok(telegram[telegram.length - 1].includes("+4 sự kiện cùng loại"));
    assert.equal((await prisma.alertState.findUniqueOrThrow({ where: { type: "need_review" } })).pendingCount, 0);

    // flush: key_missing gửi 1 + gộp 1, qua cửa sổ thì flush gửi tổng hợp
    await notifyAdmin({ type: "key_missing", lines: ["a"] });
    await notifyAdmin({ type: "key_missing", lines: ["b"] });
    assert.equal(await flushPendingAlerts(), 0); // chưa hết cửa sổ
    await prisma.alertState.update({ where: { type: "key_missing" }, data: { lastSentAt: new Date(Date.now() - 6 * 60 * 1000) } });
    const b2 = telegram.length;
    assert.equal(await flushPendingAlerts(), 1);
    assert.equal(telegram.length - b2, 1);
    assert.ok(telegram[telegram.length - 1].includes("(tổng hợp)"));
  });

  await step("lỗi gửi thông báo không làm hỏng luồng; chưa cấu hình kênh thì bỏ qua", async () => {
    await prisma.alertState.deleteMany({ where: { type: "customer_email_failed" } });
    const savedBase = process.env.TELEGRAM_API_BASE;
    process.env.TELEGRAM_API_BASE = "http://127.0.0.1:1"; // đóng
    const r = await notifyAdmin({ type: "customer_email_failed", lines: ["z"], link: "/admin/logs" });
    assert.equal(r, "sent"); // không ném lỗi
    assert.ok(await prisma.transactionLog.findFirst({ where: { type: "admin_alert_delivery" } }));
    process.env.TELEGRAM_API_BASE = savedBase;

    const a = getConfig().alerts;
    const saved = { ...a };
    a.email = "";
    a.telegramToken = "";
    assert.equal(await notifyAdmin({ type: "need_review", lines: ["q"] }), "skipped");
    Object.assign(a, saved);
  });

  // ---------- Key thất bại / thiếu key ----------
  await step("cấp key thất bại → báo admin; đơn PAID thiếu key > 10 phút → cron báo; retry hết lần → báo", async () => {
    await prisma.alertState.deleteMany(); // bắt đầu cửa sổ gộp mới để đếm chính xác
    const cfg = getConfig();
    cfg.licenseSheet.sheetId = "SHEET-X";
    cfg.licenseSheet.retry.attempts = 1;
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "sa@x.iam",
      private_key: "-----BEGIN PRIVATE KEY-----\nbad\n-----END PRIVATE KEY-----\n",
      token_uri: "http://127.0.0.1:1/token",
    });

    const o = await newOrder("nokey@example.com", "PAID", "p1", { paidAt: new Date(Date.now() - 11 * 60 * 1000) });
    const full = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { package: true } });
    const failedBefore = tgCount("Cấp key thất bại\n") + tgCount("] Cấp key thất bại");
    const key = await issueLicenseKey(full);
    assert.equal(key, null);
    assert.ok(await prisma.transactionLog.findFirst({ where: { type: "license_key_failed" } }));
    assert.equal(tgCount("] Cấp key thất bại") + tgCount("Cấp key thất bại\n") > failedBefore, true);

    const missingBefore = tgCount("chưa có key");
    assert.ok((await checkMissingKeys()) >= 1);
    assert.equal(tgCount("chưa có key"), missingBefore + 1);

    for (let i = 0; i < 4; i++) {
      await prisma.transactionLog.create({ data: { type: "license_key_failed", source: "google_sheet", status: "failed", payload: JSON.stringify({ orderCode: o.orderCode }) } });
    }
    const r = await retryMissingKeys();
    assert.ok(r.attempted >= 1 && r.issued === 0);
    assert.equal(tgCount("Cấp key thất bại nhiều lần"), 1);

    // không có thông báo nào chứa key/khóa nhạy cảm
    assert.ok(!telegram.some((t) => /FG(-[A-Z0-9]+){2,}/.test(t) || t.includes("BEGIN PRIVATE") || t.includes("TESTTOKEN")));
    cfg.licenseSheet.sheetId = "";
  });

  console.log(`\nflow: ${passed} bước đạt`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    tgServer.close();
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$disconnect();
    } catch {
      /* ignore */
    }
    for (const f of [dbPath, `${dbPath}-journal`]) fs.rmSync(f, { force: true });
  });
