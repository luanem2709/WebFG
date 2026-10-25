import nodemailer, { Transporter } from "nodemailer";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { escapeHtml, getGuideSettings } from "@/lib/settings";

let transporter: Transporter | null = null;

/** Chỉ dùng trong test: buộc tạo lại transporter sau khi đổi cấu hình email. */
export function resetTransporterForTests() {
  transporter = null;
}

interface MailSendArgs {
  from?: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

function getTransporter() {
  if (transporter) return transporter;
  const config = getConfig();
  if (config.email.devLog) {
    transporter = {
      sendMail: async (mailOptions: MailSendArgs) => {
        console.log("[EMAIL DEV LOG]", {
          to: mailOptions.to,
          subject: mailOptions.subject,
          html: mailOptions.html?.slice(0, 200),
        });
        return { messageId: `dev-${Date.now()}` };
      },
    } as unknown as Transporter;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465,
    auth: { user: config.email.smtpUser, pass: config.email.smtpPass },
  });
  return transporter;
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  type?: string;
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const config = getConfig();
  const logType = options.type || "system";
  try {
    const transport = getTransporter();
    if (!transport) throw new Error("Email transporter not initialized");
    const result = await transport.sendMail({
      from: `"${config.site.siteName}" <${config.email.from}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    await prisma.emailLog.create({
      data: {
        to: options.to,
        type: logType,
        subject: options.subject,
        status: "sent",
        sentAt: new Date(),
      },
    });

    return { success: true, messageId: result.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    await prisma.emailLog.create({
      data: {
        to: options.to,
        type: logType,
        subject: options.subject,
        status: "failed",
        error: message,
      },
    });
    if (logType !== "admin_alert") {
      try {
        const { notifyAdmin, maskEmail } = await import("@/lib/notify-admin");
        await notifyAdmin({
          type: "customer_email_failed",
          lines: [`Loại email: ${logType}`, `Gửi tới: ${maskEmail(options.to)}`, `Lỗi: ${message}`],
          link: "/admin/logs",
        });
      } catch {
        /* không để lỗi thông báo làm hỏng luồng chính */
      }
    }
    return { success: false, error: message };
  }
}

/** Khối hướng dẫn dùng chung cho email xác nhận đơn và email gửi key (link tải, 3-5 bước, hỗ trợ, hạn dùng). */
async function guideBlock(expiresAt: Date | null): Promise<string> {
  const g = await getGuideSettings();
  const cfg = getConfig();
  const steps = g.steps.slice(0, 5).map((s) => `<li style="margin:4px 0">${escapeHtml(s)}</li>`).join("");
  const download = g.downloadConfigured
    ? `<p style="margin:12px 0"><a href="${escapeHtml(g.downloadUrl)}" style="display:inline-block;padding:10px 20px;background:${cfg.site.primaryColor};color:#fff;text-decoration:none;border-radius:6px">Tải phần mềm</a></p>`
    : `<p style="margin:12px 0">Link tải: vui lòng liên hệ hỗ trợ để nhận link.</p>`;
  const exp = expiresAt ? `<p style="margin:8px 0"><strong>Hạn dùng:</strong> ${new Date(expiresAt).toLocaleString("vi-VN")}</p>` : "";
  return `
    <div style="margin:20px 0;padding:16px;border:1px solid #eee;border-radius:10px">
      <h3 style="margin:0 0 8px;font-size:16px">Hướng dẫn kích hoạt</h3>
      ${download}
      <ol style="padding-left:20px;margin:8px 0">${steps}</ol>
      ${exp}
      <p style="margin:8px 0;color:#666;font-size:14px">Hỗ trợ: ${escapeHtml(g.supportContact)} • <a href="${cfg.nextauthUrl}/guide">Xem hướng dẫn đầy đủ</a></p>
    </div>`;
}

export async function sendOrderConfirmation(
  to: string,
  orderCode: string,
  packageName: string,
  days: number,
  expiresAt: Date,
  licenseKey?: string | null
) {
  const config = getConfig();
  const guide = await guideBlock(expiresAt);
  const keyBlock = licenseKey
    ? `<div style="margin:20px 0;padding:16px;background:#f7f7f8;border-radius:10px;text-align:center"><div style="font-size:13px;color:#666;margin-bottom:6px">Key kích hoạt của bạn</div><div style="font-family:monospace;font-size:22px;font-weight:700;letter-spacing:1px;color:${config.site.primaryColor}">${licenseKey}</div></div>`
    : "";
  return sendEmail({
    to,
    type: "order_confirm",
    subject: `[${config.site.siteName}] Xác nhận đơn hàng ${orderCode}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:20px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h1 style="color:${config.site.primaryColor};margin:0 0 16px">${config.site.siteName}</h1>
        <p>Xin chào,</p>
        <p>Đơn hàng <strong>${orderCode}</strong> của bạn đã được xác nhận thành công.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Gói</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${packageName}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Thời gian</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${days} ngày</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee">Hết hạn vào</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${new Date(expiresAt).toLocaleString("vi-VN")}</td></tr>
        </table>
        ${keyBlock}
        ${guide}
        <p>Truy cập <a href="${config.nextauthUrl}/account">Tài khoản của tôi</a> để xem thời gian còn lại.</p>
        <p style="color:#666;font-size:14px">Trân trọng,<br>${config.site.siteName}</p>
      </div>
    `,
  });
}

export async function sendExpiryReminder(to: string, expiresAt: Date, daysLeft: number) {
  const config = getConfig();
  return sendEmail({
    to,
    type: "expiry_reminder",
    subject: `[${config.site.siteName}] Gói của bạn sắp hết hạn`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:20px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h1 style="color:${config.site.primaryColor};margin:0 0 16px">${config.site.siteName}</h1>
        <p>Gói sử dụng của bạn sẽ hết hạn trong <strong>${daysLeft} ngày</strong>.</p>
        <p>Hết hạn vào: ${new Date(expiresAt).toLocaleString("vi-VN")}</p>
        <a href="${config.nextauthUrl}/account" style="display:inline-block;margin-top:16px;padding:10px 20px;background:${config.site.primaryColor};color:#fff;text-decoration:none;border-radius:6px">Gia hạn ngay</a>
        <p style="color:#666;font-size:14px">Trân trọng,<br>${config.site.siteName}</p>
      </div>
    `,
  });
}

export async function sendMagicLink(to: string, token: string) {
  const config = getConfig();
  const magicUrl = `${config.nextauthUrl}/account/verify?token=${token}`;
  return sendEmail({
    to,
    type: "magic_link",
    subject: `[${config.site.siteName}] Mã truy cập tài khoản`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:20px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h1 style="color:${config.site.primaryColor};margin:0 0 16px">${config.site.siteName}</h1>
        <p>Nhấn vào nút dưới đây để truy cập tài khoản của bạn:</p>
        <a href="${magicUrl}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:${config.site.primaryColor};color:#fff;text-decoration:none;border-radius:6px">Truy cập tài khoản</a>
        <p style="color:#666;font-size:14px">Mã liên kết này có hiệu lực trong 15 phút.</p>
        <p style="color:#666;font-size:14px">Trân trọng,<br>${config.site.siteName}</p>
      </div>
    `,
  });
}

export async function sendLicenseKeyEmail(
  to: string,
  orderCode: string,
  licenseKey: string,
  packageName: string,
  expiresAt: Date | null
) {
  const config = getConfig();
  const guide = await guideBlock(expiresAt);
  return sendEmail({
    to,
    type: "license_key",
    subject: `[${config.site.siteName}] Key kích hoạt cho đơn ${orderCode}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:auto;padding:20px;background:#fff;border-radius:12px;border:1px solid #eee">
        <h1 style="color:${config.site.primaryColor};margin:0 0 16px">${config.site.siteName}</h1>
        <p>Key kích hoạt cho đơn <strong>${orderCode}</strong> (${packageName}) đã sẵn sàng:</p>
        <div style="margin:20px 0;padding:16px;background:#f7f7f8;border-radius:10px;text-align:center;font-family:monospace;font-size:22px;font-weight:700;letter-spacing:1px;color:${config.site.primaryColor}">${licenseKey}</div>
        ${guide}
        <p>Xem lại key tại <a href="${config.nextauthUrl}/account">Tài khoản của tôi</a>.</p>
        <p style="color:#666;font-size:14px">Trân trọng,<br>${config.site.siteName}</p>
      </div>
    `,
  });
}

