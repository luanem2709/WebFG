/**
 * Test end-to-end logic ghi sheet bằng Google API giả (in-memory). Không gọi Google thật.
 * Chạy: npm run test:sheet
 */
import assert from "node:assert/strict";
import http from "node:http";
import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";

type Grid = string[][];
const tabs: Record<string, Grid> = {
  LicenseKeys: [
    ["Key", "HWID", "CreatedAt", "ExpiresAt", "Status", "Note", "LastSeen"],
    ["FG-AAAA-BBBB-CCCC", "hw1", "2026-01-01 00:00:00", "Lifetime", "used", "alice", "2026-02-01 00:00:00"],
    ["FG-DDDD-EEEE-FFFF", "hw2", "2026-01-02 00:00:00", "2026-02-01 00:00:00", "expired", "bob", ""],
    ["FG-GGGG-HHHH-JJJJ", "", "2026-01-03 00:00:00", "2026-02-02 00:00:00", "unused", "", ""],
  ],
  PublishedConfigs: [["Id", "Name", "Author", "PublisherKey", "CreatedAt", "Downloads", "Data"], ["1", "n", "a", "SECRET", "t", "0", "BIGDATA"]],
};
const original = JSON.parse(JSON.stringify(tabs.LicenseKeys)) as Grid;
const touched: string[] = [];

const colNum = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
function parseRange(range: string) {
  const [tabPart, a1] = range.split("!");
  const tab = tabPart.replace(/^'|'$/g, "");
  const m = a1.match(/^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/)!;
  const grid = tabs[tab];
  const c1 = m[1] ? colNum(m[1]) : 0;
  const r1 = m[2] ? Number(m[2]) : 1;
  const c2 = m[3] !== undefined ? (m[3] ? colNum(m[3]) : 999) : c1;
  const r2 = m[4] ? Number(m[4]) : m[3] !== undefined ? grid?.length ?? 1 : r1;
  return { tab, grid, c1, c2, r1, r2 };
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const url = new URL(req.url!, "http://x");
    const send = (o: unknown, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    if (url.pathname === "/token") return send({ access_token: "tok", expires_in: 3600 });

    const path = decodeURIComponent(url.pathname.replace("/v4/spreadsheets/SHEETID", ""));
    if (path === "" && req.method === "GET") {
      return send({
        sheets: Object.keys(tabs).map((title, i) => ({
          properties: { sheetId: i, title, gridProperties: { rowCount: 1000, columnCount: 26 } },
        })),
      });
    }
    if (path === ":batchUpdate") {
      const reqs = JSON.parse(body).requests as { deleteDimension?: { range: { sheetId: number; startIndex: number } } }[];
      for (const r of reqs) {
        if (r.deleteDimension) tabs.LicenseKeys.splice(r.deleteDimension.range.startIndex, 1);
      }
      return send({});
    }
    const m = path.match(/^\/values\/(.+?)(:append)?$/)!;
    const { tab, grid, c1, c2, r1, r2 } = parseRange(m[1]);
    touched.push(tab);
    if (!grid) return send({ error: { message: "no tab" } }, 400);

    if (req.method === "GET") {
      const rows: string[][] = [];
      for (let r = r1; r <= Math.min(r2, grid.length); r++) {
        const row = (grid[r - 1] ?? []).slice(c1, c2 + 1);
        while (row.length && row[row.length - 1] === "") row.pop();
        rows.push(row);
      }
      while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
      return send(rows.length ? { values: rows } : {});
    }
    if (m[2]) {
      const values = JSON.parse(body).values as string[][];
      grid.push(values[0]);
      return send({ updates: { updatedRange: `'${tab}'!A${grid.length}:Z${grid.length}` } });
    }
    const values = JSON.parse(body).values as string[][];
    values.forEach((vals, ri) => {
      const row = (grid[r1 - 1 + ri] ??= []);
      vals.forEach((v, ci) => (row[c1 + ci] = v));
      for (let i = 0; i < row.length; i++) row[i] ??= "";
    });
    return send({});
  });
});

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

  process.env.GOOGLE_SHEET_ID = "SHEETID";
  process.env.GOOGLE_SHEETS_API_BASE = `${base}/v4/spreadsheets`;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "sa@x.iam", private_key: privateKey, token_uri: `${base}/token` });

  const { issueKeyToSheet, writeAndRemoveTestRow, getSheetStatus } = await import("@/lib/license-sheet");
  const { getConfig } = await import("@/lib/config");

  // 1. Đọc cấu trúc
  const st = await getSheetStatus();
  assert.equal(st.formatText, "FG-XXXX-XXXX-XXXX");
  assert.deepEqual(st.missing.sort(), ["days", "email", "orderId", "plan", "soldAt"].sort());

  // 2. Cấp key: tự thêm cột bên phải, giữ nguyên cột/dòng cũ
  const a = await issueKeyToSheet({ orderCode: "FGORDER1", email: "c@x.com", days: 30 });
  assert.equal(a.reused, false);
  assert.match(a.key, /^FG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const header = tabs.LicenseKeys[0];
  assert.deepEqual(header.slice(0, 7), ["Key", "HWID", "CreatedAt", "ExpiresAt", "Status", "Note", "LastSeen"]);
  assert.deepEqual(header.slice(7), ["Plan", "Days", "OrderId", "Email", "SoldAt"]);
  for (let i = 1; i < original.length; i++) assert.deepEqual(tabs.LicenseKeys[i].slice(0, 7), original[i]);
  const newRow = tabs.LicenseKeys[tabs.LicenseKeys.length - 1];
  assert.equal(newRow[0], a.key);
  assert.equal(newRow[1], ""); // HWID để trống
  assert.equal(newRow[4], getConfig().licenseSheet.newStatus);
  assert.equal(newRow[5], ""); // Note không điền bậy
  assert.deepEqual([newRow[7], newRow[8], newRow[9], newRow[10]], ["1M", "30", "FGORDER1", "c@x.com"]);

  // 3. Idempotent theo mã đơn + 2 đơn song song không trùng key
  const again = await issueKeyToSheet({ orderCode: "FGORDER1", email: "c@x.com", days: 30 });
  assert.deepEqual([again.key, again.reused], [a.key, true]);
  const [p, q] = await Promise.all([
    issueKeyToSheet({ orderCode: "FGORDER2", email: "d@x.com", days: 90 }),
    issueKeyToSheet({ orderCode: "FGORDER3", email: "e@x.com", days: 90 }),
  ]);
  assert.notEqual(p.key, q.key);
  assert.equal(tabs.LicenseKeys.length, original.length + 3);

  // 4. Dòng test: ghi rồi xóa đúng dòng đó
  const before = tabs.LicenseKeys.length;
  const t = await writeAndRemoveTestRow();
  assert.ok(t.removed);
  assert.equal(tabs.LicenseKeys.length, before);
  assert.ok(!tabs.LicenseKeys.some((r) => r[0].startsWith("FG-TEST")));

  // 5. Không bao giờ đụng PublishedConfigs
  assert.ok(!touched.includes("PublishedConfigs"), "đã truy cập PublishedConfigs!");
  assert.deepEqual(tabs.PublishedConfigs[1], ["1", "n", "a", "SECRET", "t", "0", "BIGDATA"]);

  // 6. Chế độ STOCK
  tabs.LicenseKeys.push(
    ["FG-STK1-AAAA-1111", "", "", "", "unused", "", "", "1M", "30", "", "", ""],
    ["FG-STK2-BBBB-2222", "", "", "", "unused", "", "", "3M", "90", "", "", ""]
  );
  process.env.KEY_MODE = "STOCK";
  getConfig().licenseSheet.mode = "STOCK";
  const s = await issueKeyToSheet({ orderCode: "FGORDER9", email: "z@x.com", days: 90 });
  assert.equal(s.key, "FG-STK2-BBBB-2222");
  const sold = tabs.LicenseKeys[s.row - 1];
  assert.equal(sold[4], "unused"); // Status không bị web sửa
  assert.deepEqual([sold[9], sold[10]], ["FGORDER9", "z@x.com"]);
  await assert.rejects(issueKeyToSheet({ orderCode: "FGORDERX", email: "y@x.com", days: 90 }), /Hết key tồn kho/);

  console.log("sheet logic: tất cả kiểm tra đạt");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => server.close());
