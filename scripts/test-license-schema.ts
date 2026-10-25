/** Kiểm tra offline logic khớp cột / học định dạng key (không gọi Google). Chạy: npm run test:schema */
import assert from "node:assert/strict";
import { getConfig } from "@/lib/config";
import {
  colLetter,
  defaultKeyFormat,
  describeFormat,
  formatSheetDate,
  generateKey,
  learnKeyFormat,
  mapColumns,
  normalizeHeader,
  planCode,
} from "@/lib/license-schema";

const aliases = getConfig().licenseSheet.aliases;

// Khớp cột: tiêu đề hiện có
const headers = ["Key", "HWID", "CreatedAt", "ExpiresAt", "Status", "Note", "LastSeen"];
const m = mapColumns(headers, aliases);
assert.deepEqual(
  [m.key, m.hwid, m.createdAt, m.expiresAt, m.status, m.note, m.lastSeen],
  [0, 1, 2, 3, 4, 5, 6]
);
assert.equal(m.orderId, undefined);
assert.equal(m.email, undefined);

// Khớp cột: tiêu đề Việt, có dấu / khoảng trắng / viết hoa
const vi = mapColumns(["Khóa", "Loại", "Ngày", "Trạng thái", "Mã đơn", "E-mail", "Ngày bán", "Ngày hết hạn"], aliases);
assert.deepEqual(
  [vi.key, vi.plan, vi.days, vi.status, vi.orderId, vi.email, vi.soldAt, vi.expiresAt],
  [0, 1, 2, 3, 4, 5, 6, 7]
);
assert.equal(normalizeHeader(" Mã  Đơn "), "madon");

// Học định dạng key (dữ liệu tổng hợp cùng dạng với sheet thật, có 1 key tùy chỉnh)
const samples = ["FG-AB12-CD34-EF56", "FG-ZZ99-QQ11-WW22", "FG-NAME-EM01-2004", "FG-K9K9-L8L8-M7M7", "ODD-1"];
const f = learnKeyFormat(samples)!;
assert.equal(describeFormat(f), "FG-XXXX-XXXX-XXXX");
assert.ok(/^FG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(generateKey(f)));

// Không học được → mặc định theo gói
assert.equal(learnKeyFormat([]), null);
assert.equal(learnKeyFormat(["abc", "x y"]), null);
assert.equal(describeFormat(defaultKeyFormat(30)), "FG-1M-XXXX-XXXX-XXXX");
assert.equal(describeFormat(defaultKeyFormat(90)), "FG-3M-XXXX-XXXX-XXXX");
assert.equal(planCode(45), "45D");

assert.equal(colLetter(0), "A");
assert.equal(colLetter(25), "Z");
assert.equal(colLetter(26), "AA");
assert.match(formatSheetDate(new Date("2026-01-02T03:04:05Z"), "Asia/Ho_Chi_Minh"), /^2026-01-02 10:04:05$/);

console.log("license-schema: tất cả kiểm tra đạt");
