import { createSign } from "crypto";
import { getConfig } from "@/lib/config";

/**
 * Client Google Sheets tối giản (không phụ thuộc thư viện ngoài) dùng Service Account.
 * Chỉ chạy phía server. Khóa JSON lấy từ biến môi trường, không bao giờ đưa ra client.
 */

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const apiBase = () => process.env.GOOGLE_SHEETS_API_BASE || "https://sheets.googleapis.com/v4/spreadsheets"; // override chỉ dùng cho test

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export class SheetsError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_B64;
  let json: string | undefined = raw;
  if (!json && b64) json = Buffer.from(b64, "base64").toString("utf8");
  if (json) {
    const parsed = JSON.parse(json) as ServiceAccount;
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
  throw new SheetsError("Chưa cấu hình Service Account (GOOGLE_SERVICE_ACCOUNT_JSON)");
}

export function isSheetConfigured(): boolean {
  return Boolean(
    getConfig().licenseSheet.sheetId &&
      (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
        process.env.GOOGLE_SERVICE_ACCOUNT_B64 ||
        (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY))
  );
}

let cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp - 60_000 > Date.now()) return cachedToken.token;
  const sa = loadServiceAccount();
  const aud = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.client_email,
    scope: SCOPE,
    aud,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");

  const res = await fetch(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new SheetsError(`Không lấy được token Google: ${data.error_description || res.status}`, res.status);
  }
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function sheetsFetch<T>(path: string, init: RequestInit = {}, autoRetry = true): Promise<T> {
  const { retry } = getConfig().licenseSheet;
  const attempts = autoRetry ? retry.attempts : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const token = await getAccessToken();
      const res = await fetch(`${apiBase()}/${getConfig().licenseSheet.sheetId}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status === 401) cachedToken = null;
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      const err = new SheetsError(`Google Sheets ${res.status}: ${body.error?.message || res.statusText}`, res.status);
      if (!RETRYABLE.has(res.status) && res.status !== 401) throw err;
      lastError = err;
    } catch (e) {
      if (e instanceof SheetsError && e.status && !RETRYABLE.has(e.status) && e.status !== 401) throw e;
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, retry.baseMs * 2 ** attempt + Math.random() * 200));
  }
  throw lastError instanceof Error ? lastError : new SheetsError("Google Sheets lỗi không xác định");
}

/** Chặn mọi truy cập ngoài tab được phép (đặc biệt PublishedConfigs). */
function assertAllowedTab(tab: string) {
  const cfg = getConfig().licenseSheet;
  if (tab !== cfg.tab || cfg.forbiddenTabs.includes(tab)) {
    throw new SheetsError(`Từ chối truy cập tab "${tab}": web chỉ được dùng tab "${cfg.tab}"`);
  }
}

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

export interface TabMeta {
  gid: number;
  rowCount: number;
  columnCount: number;
}

/** Chỉ lấy metadata (tên/ID tab), không lấy dữ liệu ô của bất kỳ tab nào. */
export async function getTabMeta(tab: string): Promise<TabMeta> {
  assertAllowedTab(tab);
  const data = await sheetsFetch<{
    sheets: { properties: { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } } }[];
  }>(`?fields=sheets.properties(sheetId,title,gridProperties)`);
  const found = data.sheets.find((s) => s.properties.title === tab);
  if (!found) throw new SheetsError(`Không tìm thấy tab "${tab}" trong sheet`);
  return {
    gid: found.properties.sheetId,
    rowCount: found.properties.gridProperties.rowCount,
    columnCount: found.properties.gridProperties.columnCount,
  };
}

export async function readRange(tab: string, a1: string): Promise<string[][]> {
  assertAllowedTab(tab);
  const range = encodeURIComponent(`${q(tab)}!${a1}`);
  const data = await sheetsFetch<{ values?: string[][] }>(`/values/${range}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`);
  return data.values ?? [];
}

/** Append đúng một dòng vào cuối bảng. Trả về số dòng (1-based) vừa ghi. */
export async function appendRow(tab: string, values: string[]): Promise<number> {
  assertAllowedTab(tab);
  const range = encodeURIComponent(`${q(tab)}!A1`);
  const data = await sheetsFetch<{ updates?: { updatedRange?: string } }>(
    `/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: [values] }) },
    false // không tự retry append: caller đọc lại sheet để tránh ghi trùng
  );
  const m = data.updates?.updatedRange?.match(/!(?:[A-Z]+)(\d+)/);
  if (!m) throw new SheetsError("Không xác định được dòng vừa ghi");
  return Number(m[1]);
}

export async function updateCells(tab: string, a1: string, values: string[][]): Promise<void> {
  assertAllowedTab(tab);
  const range = encodeURIComponent(`${q(tab)}!${a1}`);
  await sheetsFetch(`/values/${range}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ majorDimension: "ROWS", values }),
  });
}

/** Xóa đúng một dòng (chỉ dùng cho dòng test do script check-sheet tạo ra). */
export async function deleteRow(tab: string, gid: number, row1Based: number): Promise<void> {
  assertAllowedTab(tab);
  if (row1Based < 2) throw new SheetsError("Không được xóa dòng tiêu đề");
  await sheetsFetch(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: { sheetId: gid, dimension: "ROWS", startIndex: row1Based - 1, endIndex: row1Based },
          },
        },
      ],
    }),
  });
}

/** Mở rộng lưới nếu thiếu cột (chỉ thêm bên phải). */
export async function ensureColumnCount(gid: number, current: number, needed: number): Promise<void> {
  if (needed <= current) return;
  await sheetsFetch(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ appendDimension: { sheetId: gid, dimension: "COLUMNS", length: needed - current } }],
    }),
  });
}

