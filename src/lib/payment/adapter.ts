import { createHash } from "crypto";

export interface PaymentPayload {
  orderCode?: string;
  reference?: string;
  content?: string;
  transactionId?: string;
  amount?: number;
  status?: string;
  [key: string]: unknown;
}

export interface PaymentResult {
  /** true = webhook hợp lệ và là tiền VÀO (kể cả khi chưa khớp được mã đơn). */
  success: boolean;
  orderCode?: string;
  transactionId?: string;
  paidAmount?: number;
  raw: PaymentPayload;
  error?: string;
  /** Sai khóa/chữ ký xác thực → route phải trả 401 và ghi nhận. */
  authFailed?: boolean;
  /** Webhook hợp lệ nhưng không phải tiền vào → bỏ qua, trả 200. */
  ignored?: boolean;
}

export interface PaymentAdapter {
  name: string;
  verify(payload: PaymentPayload, signature?: string): Promise<PaymentResult>;
  createPayment(orderCode: string, amount: number, description: string): Promise<{
    checkoutUrl?: string;
    qrData?: string;
    bankInfo?: { bin: string; account: string; name: string; content: string };
    raw: Record<string, unknown>;
  }>;
}

const ORDER_CODE_RE = /FG[A-Z0-9]{8,16}/i;

function extractOrderCode(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const m = c.match(ORDER_CODE_RE);
    if (m) return m[0].toUpperCase();
  }
  return undefined;
}

/** Khi cổng không gửi mã giao dịch: dùng hash nội dung để vẫn chống trùng được. */
function fallbackTxId(prefix: string, payload: unknown): string {
  return `${prefix}-H${createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex").slice(0, 24)}`;
}

export class MockPaymentAdapter implements PaymentAdapter {
  name = "mock";

  async verify(payload: PaymentPayload): Promise<PaymentResult> {
    const orderCode = payload?.orderCode || payload?.reference;
    const amount = payload?.amount;
    const status = payload?.status || "success";

    if (!orderCode) {
      return { success: false, raw: payload, error: "Missing orderCode" };
    }

    return {
      success: status === "success",
      orderCode: String(orderCode),
      // Xác định theo mã đơn: mỗi đơn chỉ "trả tiền" mock được một lần.
      transactionId: String(payload?.transactionId || `MOCK-${orderCode}`),
      paidAmount: amount,
      raw: payload,
    };
  }

  async createPayment(orderCode: string, amount: number, description: string) {
    return {
      qrData: `VIETQR|MOCK|${orderCode}|${amount}|${description}`,
      bankInfo: {
        bin: "970418",
        account: "1234567890",
        name: "FUNNYGAME",
        content: orderCode,
      },
      raw: { orderCode, amount, description, status: "pending", gateway: "mock" },
    };
  }
}

export class SePayAdapter implements PaymentAdapter {
  name = "sepay";
  private apiKey: string;
  private secret: string;
  private merchantId: string;

  constructor(apiKey: string, secret: string, merchantId: string) {
    this.apiKey = apiKey;
    this.secret = secret;
    this.merchantId = merchantId;
  }

  /** SePay gửi header `Authorization: Apikey <API key>`; body: id, content, transferType, transferAmount. */
  async verify(payload: PaymentPayload, signature?: string): Promise<PaymentResult> {
    if (!this.apiKey || signature !== `Apikey ${this.apiKey}`) {
      return { success: false, raw: payload, error: "Invalid SePay API key", authFailed: true };
    }
    if (payload?.transferType && payload.transferType !== "in") {
      return { success: false, raw: payload, ignored: true, error: "Not an incoming transfer" };
    }
    const orderCode = extractOrderCode(payload?.orderCode, payload?.code, payload?.content);
    const amount = Number(payload?.transferAmount ?? payload?.amount);
    return {
      success: true,
      orderCode,
      transactionId: String(payload?.id ?? payload?.transactionId ?? fallbackTxId("SEPAY", payload)),
      paidAmount: Number.isFinite(amount) ? amount : undefined,
      raw: payload,
    };
  }

  async createPayment(orderCode: string, amount: number, description: string) {
    const raw = {
      orderCode,
      amount,
      description,
      merchantId: this.merchantId,
    };
    return {
      qrData: `https://sepay.vn/payment/${orderCode}`,
      bankInfo: {
        bin: "970418",
        account: this.merchantId,
        name: "FUNNYGAME",
        content: orderCode,
      },
      raw,
    };
  }
}

export class CassoAdapter implements PaymentAdapter {
  name = "casso";
  private apiKey: string;
  private secret: string;
  private merchantId: string;

  constructor(apiKey: string, secret: string, merchantId: string) {
    this.apiKey = apiKey;
    this.secret = secret;
    this.merchantId = merchantId;
  }

  /** Casso gửi header `secure-token` (khớp secret); body: { error, data: [{ id, description, amount }] }. */
  async verify(payload: PaymentPayload, signature?: string): Promise<PaymentResult> {
    if (!this.secret || signature !== this.secret) {
      return { success: false, raw: payload, error: "Invalid Casso secure-token", authFailed: true };
    }
    const first = Array.isArray(payload?.data) ? (payload.data[0] as Record<string, unknown> | undefined) : undefined;
    const src = (first ?? payload) as Record<string, unknown>;
    const amount = Number(src.amount);
    if (Number.isFinite(amount) && amount <= 0) {
      return { success: false, raw: payload, ignored: true, error: "Not an incoming transfer" };
    }
    return {
      success: true,
      orderCode: extractOrderCode(src.orderCode, src.description, src.content),
      transactionId: String(src.id ?? src.tid ?? fallbackTxId("CASSO", payload)),
      paidAmount: Number.isFinite(amount) ? amount : undefined,
      raw: payload,
    };
  }

  async createPayment(orderCode: string, amount: number, description: string) {
    const raw = {
      orderCode,
      amount,
      description,
      merchantId: this.merchantId,
    };
    return {
      qrData: `https://casso.vn/payment/${orderCode}`,
      bankInfo: {
        bin: "970418",
        account: this.merchantId,
        name: "FUNNYGAME",
        content: orderCode,
      },
      raw,
    };
  }
}

export function createAdapter(
  gateway: "mock" | "sepay" | "casso",
  sepayApiKey: string,
  sepaySecret: string,
  sepayMerchantId: string,
  cassoApiKey: string,
  cassoSecret: string,
  cassoMerchantId: string
): PaymentAdapter {
  switch (gateway) {
    case "sepay":
      return new SePayAdapter(sepayApiKey, sepaySecret, sepayMerchantId);
    case "casso":
      return new CassoAdapter(cassoApiKey, cassoSecret, cassoMerchantId);
    default:
      return new MockPaymentAdapter();
  }
}
