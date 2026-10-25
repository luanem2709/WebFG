import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";

/** Các khóa cấu hình trong bảng Config mà admin điền ở trang Cấu hình. */
export const GUIDE_KEYS = ["downloadUrl", "guideText", "supportContact"] as const;
export type GuideKey = (typeof GUIDE_KEYS)[number];

export const DEFAULT_GUIDE_TEXT = [
  "Tải phần mềm funnygame từ link tải và cài đặt.",
  "Mở phần mềm, chọn mục nhập key / kích hoạt.",
  "Dán key bạn nhận được (dạng FG-XXXX-XXXX-XXXX) rồi xác nhận.",
  "Key sẽ gắn với thiết bị của bạn – mỗi key chỉ dùng cho một thiết bị.",
  "Gặp lỗi hoặc cần đổi thiết bị: liên hệ hỗ trợ kèm mã đơn hàng.",
].join("\n");

export interface GuideSettings {
  downloadUrl: string;
  downloadConfigured: boolean;
  guideText: string;
  guideConfigured: boolean;
  steps: string[];
  supportContact: string;
  supportConfigured: boolean;
}

export async function getGuideSettings(): Promise<GuideSettings> {
  const rows = await prisma.config.findMany({ where: { key: { in: [...GUIDE_KEYS] } } });
  const map = new Map(rows.map((r) => [r.key, r.value.trim()]));
  const site = getConfig().site;

  const downloadUrl = map.get("downloadUrl") || "";
  const guideText = map.get("guideText") || "";
  const supportContact = map.get("supportContact") || "";
  const text = guideText || DEFAULT_GUIDE_TEXT;

  return {
    downloadUrl,
    downloadConfigured: /^https?:\/\//i.test(downloadUrl),
    guideText: text,
    guideConfigured: Boolean(guideText),
    steps: text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    supportContact: supportContact || site.contactEmail,
    supportConfigured: Boolean(supportContact),
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
