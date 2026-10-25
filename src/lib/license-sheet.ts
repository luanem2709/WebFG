import { getConfig, type LicenseField } from "@/lib/config";
import {
  appendRow,
  deleteRow,
  ensureColumnCount,
  getTabMeta,
  readRange,
  updateCells,
  SheetsError,
  type TabMeta,
} from "@/lib/google-sheets";
import {
  colLetter,
  defaultKeyFormat,
  describeFormat,
  formatSheetDate,
  generateKey,
  learnKeyFormat,
  mapColumns,
  planCode,
  type ColumnMap,
  type KeyFormat,
} from "@/lib/license-schema";

/** Các trường web cần ghi; nếu sheet thiếu sẽ thêm cột mới ở bên phải cùng (không chèn giữa). */
const REQUIRED_FIELDS: LicenseField[] = ["status", "expiresAt", "createdAt", "plan", "days", "orderId", "email", "soldAt"];

export interface LicenseSchema {
  tab: string;
  meta: TabMeta;
  headers: string[];
  columns: ColumnMap;
  /** Các trường chưa có cột (sẽ được thêm khi ghi lần đầu). */
  missing: LicenseField[];
  sampleKeys: string[];
  format: KeyFormat;
}

export interface IssueInput {
  orderCode: string;
  email: string;
  days: number;
}

export interface IssuedKey {
  key: string;
  row: number;
  reused: boolean;
}

// ---- khóa chống 2 đơn ghi cùng lúc (trong 1 tiến trình) ----
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

// ---- đọc cấu trúc ----
export async function loadSchema(forDays = 30): Promise<LicenseSchema> {
  const cfg = getConfig().licenseSheet;
  const meta = await getTabMeta(cfg.tab);
  const headerRows = await readRange(cfg.tab, "1:1");
  const headers = (headerRows[0] ?? []).map((h) => String(h ?? ""));
  const columns = mapColumns(headers, cfg.aliases);
  if (columns.key === undefined) {
    throw new SheetsError(`Tab "${cfg.tab}" không có cột Key (tiêu đề: ${headers.join(", ") || "trống"})`);
  }

  const keyCol = colLetter(columns.key);
  const keyValues = (await readRange(cfg.tab, `${keyCol}2:${keyCol}`)).map((r) => (r[0] ?? "").trim()).filter(Boolean);
  const sampleKeys = keyValues.slice(-10);
  const format = learnKeyFormat(sampleKeys) ?? defaultKeyFormat(forDays);
  const missing = REQUIRED_FIELDS.filter((f) => columns[f] === undefined);
  return { tab: cfg.tab, meta, headers, columns, missing, sampleKeys, format };
}

/** Thêm các cột còn thiếu vào bên phải cùng của dòng tiêu đề. Không đụng tới cột cũ. */
async function ensureColumns(schema: LicenseSchema): Promise<LicenseSchema> {
  if (schema.missing.length === 0) return schema;
  const cfg = getConfig().licenseSheet;
  const headers = [...schema.headers];
  while (headers.length > 0 && headers[headers.length - 1] === "") headers.pop();
  const columns: ColumnMap = { ...schema.columns };
  const startIndex = headers.length;
  const newHeaders: string[] = [];
  for (const f of schema.missing) {
    columns[f] = startIndex + newHeaders.length;
    newHeaders.push(cfg.newColumnHeaders[f] || f);
  }
  await ensureColumnCount(schema.meta.gid, schema.meta.columnCount, startIndex + newHeaders.length);
  await updateCells(
    schema.tab,
    `${colLetter(startIndex)}1:${colLetter(startIndex + newHeaders.length - 1)}1`,
    [newHeaders]
  );
  return {
    ...schema,
    headers: [...headers, ...newHeaders],
    columns,
    missing: [],
    meta: { ...schema.meta, columnCount: Math.max(schema.meta.columnCount, startIndex + newHeaders.length) },
  };
}

async function readColumn(schema: LicenseSchema, field: LicenseField): Promise<string[]> {
  const idx = schema.columns[field];
  if (idx === undefined) return [];
  const L = colLetter(idx);
  const rows = await readRange(schema.tab, `${L}2:${L}`);
  return rows.map((r) => (r[0] ?? "").trim());
}

async function readRow(schema: LicenseSchema, row: number): Promise<string[]> {
  const last = colLetter(Math.max(schema.headers.length, 1) - 1);
  const rows = await readRange(schema.tab, `A${row}:${last}${row}`);
  return rows[0] ?? [];
}

const cell = (row: string[], schema: LicenseSchema, f: LicenseField) =>
  schema.columns[f] === undefined ? "" : (row[schema.columns[f]!] ?? "").trim();

/** Tìm key đã cấp cho mã đơn (idempotent). */
async function findByOrder(schema: LicenseSchema, orderCode: string): Promise<IssuedKey | null> {
  if (schema.columns.orderId === undefined) return null;
  const orders = await readColumn(schema, "orderId");
  const i = orders.findIndex((o) => o === orderCode);
  if (i === -1) return null;
  const row = i + 2;
  const key = cell(await readRow(schema, row), schema, "key");
  return key ? { key, row, reused: true } : null;
}

function buildRow(schema: LicenseSchema, values: Partial<Record<LicenseField, string>>): string[] {
  const row = new Array<string>(schema.headers.length).fill("");
  (Object.keys(values) as LicenseField[]).forEach((f) => {
    const idx = schema.columns[f];
    if (idx !== undefined) row[idx] = values[f] ?? "";
  });
  return row;
}

// ---- GENERATE ----
async function issueGenerate(input: IssueInput): Promise<IssuedKey> {
  const cfg = getConfig().licenseSheet;
  let schema = await loadSchema(input.days);
  schema = await ensureColumns(schema);

  const existing = await findByOrder(schema, input.orderCode);
  if (existing) return existing;

  const taken = new Set((await readColumn(schema, "key")).map((k) => k.toUpperCase()));
  let key = "";
  for (let i = 0; i < 20; i++) {
    const candidate = generateKey(schema.format);
    if (!taken.has(candidate)) {
      key = candidate;
      break;
    }
  }
  if (!key) throw new SheetsError("Không sinh được key không trùng");

  const now = new Date();
  const expires = new Date(now.getTime() + input.days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => formatSheetDate(d, cfg.timezone);
  const row = buildRow(schema, {
    key,
    createdAt: fmt(now),
    expiresAt: fmt(expires),
    status: cfg.newStatus,
    plan: planCode(input.days),
    days: String(input.days),
    orderId: input.orderCode,
    email: input.email,
    soldAt: fmt(now),
  });

  let rowNumber: number | null = null;
  try {
    rowNumber = await appendRow(schema.tab, row);
  } catch (e) {
    // Có thể Google đã ghi nhưng phản hồi bị mất: đọc lại trước khi báo lỗi.
    const found = await findByOrder(schema, input.orderCode).catch(() => null);
    if (found) return found;
    throw e;
  }

  // Đọc lại để xác nhận key đã nằm trong sheet rồi mới giao cho khách.
  const back = await readRow(schema, rowNumber);
  if (cell(back, schema, "key") !== key) {
    const found = await findByOrder(schema, input.orderCode);
    if (found && found.key === key) return found;
    throw new SheetsError("Xác nhận sau khi ghi thất bại: key không có trong sheet");
  }
  return { key, row: rowNumber, reused: false };
}

// ---- STOCK ----
async function issueStock(input: IssueInput): Promise<IssuedKey> {
  const cfg = getConfig().licenseSheet;
  let schema = await loadSchema(input.days);
  schema = await ensureColumns(schema);

  const existing = await findByOrder(schema, input.orderCode);
  if (existing) return existing;

  const last = colLetter(schema.headers.length - 1);
  const rows = await readRange(schema.tab, `A2:${last}`);
  const wantPlan = planCode(input.days).toUpperCase();
  const stock = new Set(cfg.stockStatuses.map((s) => s.toLowerCase()));

  let target = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!cell(r, schema, "key")) continue;
    if (cell(r, schema, "orderId")) continue;
    if (cell(r, schema, "hwid")) continue;
    if (!stock.has(cell(r, schema, "status").toLowerCase())) continue;
    const plan = cell(r, schema, "plan").toUpperCase();
    const days = cell(r, schema, "days");
    if (plan && plan !== wantPlan) continue;
    if (days && Number(days) !== input.days) continue;
    if (!plan && !days) continue; // dòng chưa gán gói thì không bán nhầm
    target = i + 2;
    break;
  }
  if (target === -1) throw new SheetsError(`Hết key tồn kho cho gói ${wantPlan}`);

  const row = rows[target - 2];
  const key = cell(row, schema, "key");
  // Chỉ ghi vào các cột do web quản lý (OrderId/Email/SoldAt); không đụng Status/ExpiresAt/HWID...
  const writes: [LicenseField, string][] = [
    ["orderId", input.orderCode],
    ["email", input.email],
    ["soldAt", formatSheetDate(new Date(), cfg.timezone)],
  ];
  for (const [f, v] of writes) {
    const L = colLetter(schema.columns[f]!);
    await updateCells(schema.tab, `${L}${target}`, [[v]]);
  }

  const back = await readRow(schema, target);
  if (cell(back, schema, "orderId") !== input.orderCode || cell(back, schema, "key") !== key) {
    throw new SheetsError("Xác nhận sau khi ghi thất bại (có thể dòng bị ứng dụng khác thay đổi)");
  }
  return { key, row: target, reused: false };
}

export function issueKeyToSheet(input: IssueInput): Promise<IssuedKey> {
  return withLock(() => (getConfig().licenseSheet.mode === "STOCK" ? issueStock(input) : issueGenerate(input)));
}

// ---- trạng thái cho admin / script kiểm tra ----
export interface SheetStatus {
  mode: string;
  tab: string;
  headers: string[];
  mapping: { field: LicenseField; header: string; column: string }[];
  missing: LicenseField[];
  formatText: string;
  formatLearned: boolean;
  sampleCount: number;
  stockAvailable?: number;
}

export async function getSheetStatus(): Promise<SheetStatus> {
  const cfg = getConfig().licenseSheet;
  const schema = await loadSchema();
  const mapping = (Object.keys(schema.columns) as LicenseField[]).map((field) => ({
    field,
    header: schema.headers[schema.columns[field]!] ?? "",
    column: colLetter(schema.columns[field]!),
  }));
  const status: SheetStatus = {
    mode: cfg.mode,
    tab: schema.tab,
    headers: schema.headers,
    mapping,
    missing: schema.missing,
    formatText: describeFormat(schema.format),
    formatLearned: schema.format.learned,
    sampleCount: schema.sampleKeys.length,
  };
  if (cfg.mode === "STOCK") {
    const rows = await readRange(schema.tab, `A2:${colLetter(Math.max(schema.headers.length, 1) - 1)}`);
    const stock = new Set(cfg.stockStatuses.map((s) => s.toLowerCase()));
    status.stockAvailable = rows.filter(
      (r) =>
        cell(r, schema, "key") &&
        !cell(r, schema, "orderId") &&
        !cell(r, schema, "hwid") &&
        stock.has(cell(r, schema, "status").toLowerCase()) &&
        (cell(r, schema, "plan") || cell(r, schema, "days"))
    ).length;
  }
  return status;
}

/** Dùng cho `npm run check-sheet --write`: ghi 1 dòng test rồi xóa đúng dòng đó. */
export async function writeAndRemoveTestRow(): Promise<{ key: string; row: number; removed: boolean }> {
  return withLock(async () => {
    const cfg = getConfig().licenseSheet;
    let schema = await loadSchema(30);
    schema = await ensureColumns(schema);
    const testKey = `FG-TEST-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const fmt = (d: Date) => formatSheetDate(d, cfg.timezone);
    const row = await appendRow(
      schema.tab,
      buildRow(schema, {
        key: testKey,
        createdAt: fmt(now),
        expiresAt: fmt(now),
        status: "test",
        orderId: "CHECK-SHEET",
        email: "check-sheet@local",
      })
    );
    const back = await readRow(schema, row);
    if (cell(back, schema, "key") !== testKey) {
      throw new SheetsError("Dòng test không khớp sau khi ghi — KHÔNG xóa để tránh xóa nhầm dòng của ứng dụng khác");
    }
    // Tìm lại vị trí hiện tại của đúng dòng test ngay trước khi xóa (phòng dòng bị dịch chuyển).
    const keys = await readColumn(schema, "key");
    const idx = keys.lastIndexOf(testKey);
    if (idx === -1) throw new SheetsError("Không tìm thấy dòng test để xóa");
    const current = idx + 2;
    const verify = await readRow(schema, current);
    if (cell(verify, schema, "key") !== testKey || cell(verify, schema, "orderId") !== "CHECK-SHEET") {
      throw new SheetsError("Dòng test đã thay đổi, từ chối xóa");
    }
    await deleteRow(schema.tab, schema.meta.gid, current);
    return { key: testKey, row: current, removed: true };
  });
}

// ---- Thu hồi key (CHỈ ĐỌC): web không bao giờ sửa/xóa dòng có sẵn ----
export interface KeyInspection {
  row: number;
  status: string;
  expiresAt: string;
}

export interface RevocationInfo {
  byKey: Record<string, KeyInspection>;
  statusColumn?: string;
  expiresColumn?: string;
  /** Các giá trị Status đang xuất hiện trong sheet (gợi ý cách ứng dụng cũ phân biệt trạng thái). */
  statusValues: string[];
}

/** Tìm số dòng + Status/ExpiresAt hiện tại của các key (chỉ đọc) để admin tự thu hồi. */
export async function inspectKeys(keys: string[]): Promise<RevocationInfo> {
  const schema = await loadSchema();
  const last = colLetter(Math.max(schema.headers.length, 1) - 1);
  const rows = await readRange(schema.tab, `A2:${last}`);
  const want = new Set(keys.map((k) => k.toUpperCase()));
  const byKey: Record<string, KeyInspection> = {};
  const statuses = new Set<string>();
  rows.forEach((r, i) => {
    const key = cell(r, schema, "key");
    const status = cell(r, schema, "status");
    if (status) statuses.add(status);
    if (key && want.has(key.toUpperCase())) {
      byKey[key.toUpperCase()] = { row: i + 2, status, expiresAt: cell(r, schema, "expiresAt") };
    }
  });
  const hdr = (f: LicenseField) => (schema.columns[f] === undefined ? undefined : schema.headers[schema.columns[f]!]);
  return {
    byKey,
    statusColumn: hdr("status"),
    expiresColumn: hdr("expiresAt"),
    statusValues: [...statuses].slice(0, 12),
  };
}
