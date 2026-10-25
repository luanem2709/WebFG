import { randomInt } from "crypto";
import type { LicenseField } from "@/lib/config";

/** Chuẩn hóa tên cột: bỏ dấu, chữ thường, chỉ giữ a-z0-9. */
export function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type ColumnMap = Partial<Record<LicenseField, number>>;

/** Khớp cột theo tên tiêu đề. Cột đầu tiên khớp thắng; mỗi cột chỉ gán cho một trường. */
export function mapColumns(
  headers: string[],
  aliases: Record<LicenseField, string[]>
): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  const normalized = headers.map(normalizeHeader);
  (Object.keys(aliases) as LicenseField[]).forEach((field) => {
    for (const alias of aliases[field]) {
      const idx = normalized.findIndex((h, i) => h === alias && !used.has(i));
      if (idx !== -1) {
        map[field] = idx;
        used.add(idx);
        return;
      }
    }
  });
  return map;
}

/** Số cột → chữ cột A1 (0 → A, 26 → AA). */
export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function planCode(days: number): string {
  if (days % 30 === 0 && days >= 30) return `${days / 30}M`;
  return `${days}D`;
}

export interface KeyFormat {
  /** Đoạn đầu cố định, ví dụ "FG". */
  prefix: string;
  /** Độ dài các đoạn ngẫu nhiên phía sau. */
  blocks: number[];
  charset: string;
  learned: boolean;
}

const KEY_RE = /^[A-Z0-9]+(-[A-Z0-9]+)+$/;
const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Học định dạng key từ các key có sẵn (lấy dạng xuất hiện nhiều nhất). */
export function learnKeyFormat(samples: string[]): KeyFormat | null {
  const keys = samples.map((k) => k.trim().toUpperCase()).filter((k) => KEY_RE.test(k));
  if (keys.length === 0) return null;
  const counts = new Map<string, { n: number; segs: string[] }>();
  for (const k of keys) {
    const segs = k.split("-");
    const sig = `${segs[0]}|${segs.slice(1).map((s) => s.length).join(",")}`;
    const cur = counts.get(sig);
    counts.set(sig, { n: (cur?.n ?? 0) + 1, segs });
  }
  let best: { n: number; segs: string[] } | null = null;
  for (const v of counts.values()) if (!best || v.n >= best.n) best = v;
  if (!best || best.n / keys.length < 0.5) return null;
  return {
    prefix: best.segs[0],
    blocks: best.segs.slice(1).map((s) => s.length),
    charset: CHARSET,
    learned: true,
  };
}

/** Mặc định khi không học được: FG-1M-XXXX-XXXX-XXXX / FG-3M-XXXX-XXXX-XXXX. */
export function defaultKeyFormat(days: number): KeyFormat {
  return { prefix: `FG-${planCode(days)}`, blocks: [4, 4, 4], charset: CHARSET, learned: false };
}

export function generateKey(format: KeyFormat): string {
  const block = (len: number) =>
    Array.from({ length: len }, () => format.charset[randomInt(format.charset.length)]).join("");
  return [format.prefix, ...format.blocks.map(block)].join("-");
}

export function describeFormat(f: KeyFormat): string {
  return [f.prefix, ...f.blocks.map((n) => "X".repeat(n))].join("-");
}

/** Ngày giờ theo múi giờ cấu hình, dạng yyyy-MM-dd HH:mm:ss (khớp dữ liệu sheet hiện có). */
export function formatSheetDate(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = g("hour") === "24" ? "00" : g("hour");
  return `${g("year")}-${g("month")}-${g("day")} ${hour}:${g("minute")}:${g("second")}`;
}
