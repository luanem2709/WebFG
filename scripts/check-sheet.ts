/**
 * Kiểm tra kết nối Google Sheet (tab LicenseKeys).
 *
 *   npm run check-sheet                # chỉ-đọc (mặc định, an toàn)
 *   npm run check-sheet -- --write     # ghi thử 1 dòng test rồi xóa đúng dòng đó
 *
 * Không bao giờ đọc/ghi tab PublishedConfigs.
 */
import { getConfig } from "@/lib/config";
import { isSheetConfigured } from "@/lib/google-sheets";
import { getSheetStatus, writeAndRemoveTestRow } from "@/lib/license-sheet";

async function main() {
  const write = process.argv.includes("--write");
  const cfg = getConfig().licenseSheet;

  console.log(`Sheet ID : ${cfg.sheetId ? cfg.sheetId.slice(0, 6) + "…" + cfg.sheetId.slice(-4) : "(chưa đặt GOOGLE_SHEET_ID)"}`);
  console.log(`Tab      : ${cfg.tab}   (tab bị cấm: ${cfg.forbiddenTabs.join(", ")})`);
  console.log(`Chế độ   : ${cfg.mode}   |   Ghi thử: ${write ? "CÓ" : "KHÔNG (chỉ-đọc)"}\n`);

  if (!isSheetConfigured()) {
    console.error("✗ Chưa cấu hình GOOGLE_SHEET_ID hoặc GOOGLE_SERVICE_ACCOUNT_JSON trong .env");
    process.exit(1);
  }

  const s = await getSheetStatus();
  console.log("✓ Đọc được tiêu đề. Cách khớp cột:");
  for (const m of s.mapping) console.log(`   ${m.field.padEnd(10)} ← cột ${m.column} "${m.header}"`);
  console.log(
    s.missing.length
      ? `\n! Cột sẽ được THÊM vào bên phải khi ghi lần đầu: ${s.missing.join(", ")}`
      : "\n✓ Đủ mọi cột cần thiết"
  );
  console.log(
    `\nĐịnh dạng key: ${s.formatText} (${s.formatLearned ? `học từ ${s.sampleCount} key có sẵn` : "mặc định — không học được từ sheet"})`
  );
  if (s.stockAvailable !== undefined) console.log(`Key tồn kho còn lại: ${s.stockAvailable}`);

  if (write) {
    const r = await writeAndRemoveTestRow();
    console.log(`\n✓ Đã ghi dòng test (${r.key}) và xóa đúng dòng đó (dòng ${r.row}).`);
  }
  console.log("\nHoàn tất.");
}

main().catch((e) => {
  console.error("✗ Lỗi:", e instanceof Error ? e.message : e);
  process.exit(1);
});
