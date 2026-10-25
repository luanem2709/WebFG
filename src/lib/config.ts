export interface PackageConfig {
  id: string;
  name: string;
  days: number;
  price: number;
  active: boolean;
  label: "NEW" | "POPULAR" | "SAVING" | "NONE";
  sortOrder?: number;
  description?: string;
}

export interface SiteConfig {
  siteName: string;
  siteTitle: string;
  primaryColor: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
}

export interface PaymentConfig {
  gateway: "mock" | "sepay" | "casso";
  sepayApiKey: string;
  sepaySecret: string;
  sepayMerchantId: string;
  cassoApiKey: string;
  cassoSecret: string;
  cassoMerchantId: string;
  vietqrBin: string;
  vietqrAccount: string;
  vietqrAccountName: string;
  vietqrTemplate: string;
  sandbox: boolean;
}

export interface EmailConfig {
  from: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  devLog: boolean;
}

export interface AdminConfig {
  username: string;
  password: string;
  sessionSecret: string;
}

export interface BusinessConfig {
  expiryRemindDays: number;
  orderHoldMinutes: number;
}

export type LicenseField =
  | "key" | "hwid" | "createdAt" | "expiresAt" | "status" | "note" | "lastSeen"
  | "plan" | "days" | "orderId" | "email" | "soldAt";

export interface LicenseSheetConfig {
  /** ID Google Sheet (GOOGLE_SHEET_ID) — KHÔNG hard-code. */
  sheetId: string;
  /** Tab duy nhất web được phép ghi. */
  tab: string;
  /** Các tab tuyệt đối không được đụng tới. */
  forbiddenTabs: string[];
  /** GENERATE: tự sinh key mới rồi append. STOCK: lấy key chưa bán có sẵn trong sheet. */
  mode: "GENERATE" | "STOCK";
  /** Trạng thái ghi cho key mới. */
  newStatus: string;
  /** Trạng thái được coi là "chưa bán" trong chế độ STOCK. */
  stockStatuses: string[];
  /** Múi giờ dùng khi ghi ngày giờ vào sheet. */
  timezone: string;
  /** Ánh xạ tên cột (đã chuẩn hóa: không dấu, chữ thường, bỏ ký tự đặc biệt) → trường logic. Sửa tay tại đây. */
  aliases: Record<LicenseField, string[]>;
  /** Tên tiêu đề dùng khi phải thêm cột mới vào bên phải. */
  newColumnHeaders: Partial<Record<LicenseField, string>>;
  retry: { attempts: number; baseMs: number };
  /** MANUAL (mặc định): chỉ liệt kê key cần thu hồi cho admin xử lý tay. OFF: tắt tính năng. Web KHÔNG BAO GIỜ tự sửa dòng cũ. */
  revokeMode: "MANUAL" | "OFF";
}

export interface AlertsConfig {
  email: string;
  telegramToken: string;
  telegramChatId: string;
  /** Gộp các thông báo cùng loại trong khoảng này thành 1. */
  windowMs: number;
}

export interface AppConfig {
  site: SiteConfig;
  packages: PackageConfig[];
  payment: PaymentConfig;
  email: EmailConfig;
  admin: AdminConfig;
  business: BusinessConfig;
  licenseSheet: LicenseSheetConfig;
  alerts: AlertsConfig;
  nextauthUrl: string;
  nextauthSecret: string;
}

const DEFAULTS: AppConfig = {
  site: {
    siteName: process.env.SITE_NAME || "funnygame",
    siteTitle: process.env.SITE_TITLE || "funnygame - Gói sử dụng dịch vụ",
    primaryColor: process.env.PRIMARY_COLOR || "#ff6b6b",
    contactEmail: process.env.CONTACT_EMAIL || "support@funnygame.vn",
    contactPhone: process.env.CONTACT_PHONE || "0900 123 456",
    contactAddress: process.env.CONTACT_ADDRESS || "123 Đường ABC, Quận 1, TP. Hồ Chí Minh",
  },
  packages: [
    {
      id: "pkg-1-month",
      name: "Gói 1 tháng",
      days: 30,
      price: 300000,
      active: true,
      label: "NONE",
      sortOrder: 1,
      description: "Sử dụng funnygame trong 30 ngày",
    },
    {
      id: "pkg-3-month",
      name: "Gói 3 tháng",
      days: 90,
      price: 750000,
      active: true,
      label: "SAVING",
      sortOrder: 2,
      description: "Sử dụng funnygame trong 90 ngày, tiết kiệm 150.000đ so với mua 3 lần gói 1 tháng",
    },
  ],
  payment: {
    gateway: (process.env.PAYMENT_GATEWAY as "mock" | "sepay" | "casso") || "mock",
    sepayApiKey: process.env.SEPAY_API_KEY || "",
    sepaySecret: process.env.SEPAY_SECRET || "",
    sepayMerchantId: process.env.SEPAY_MERCHANT_ID || "",
    cassoApiKey: process.env.CASSO_API_KEY || "",
    cassoSecret: process.env.CASSO_SECRET || "",
    cassoMerchantId: process.env.CASSO_MERCHANT_ID || "",
    vietqrBin: process.env.VIETQR_BIN || "970418",
    vietqrAccount: process.env.VIETQR_ACCOUNT || "1234567890",
    vietqrAccountName: process.env.VIETQR_ACCOUNT_NAME || "FUNNYGAME",
    vietqrTemplate: process.env.VIETQR_TEMPLATE || "compact",
    sandbox: process.env.SANDBOX !== "false",
  },
  email: {
    from: process.env.EMAIL_FROM || "noreply@funnygame.vn",
    smtpHost: process.env.SMTP_HOST || "smtp.example.com",
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    devLog: process.env.EMAIL_DEV_LOG !== "false",
  },
  admin: {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "Admin123!",
    sessionSecret: process.env.ADMIN_SESSION_SECRET || "change-me-in-production-32-chars-min",
  },
  business: {
    expiryRemindDays: Number(process.env.EXPIRY_REMIND_DAYS || 3),
    orderHoldMinutes: Number(process.env.ORDER_HOLD_MINUTES || 15),
  },
  licenseSheet: {
    sheetId: process.env.GOOGLE_SHEET_ID || "",
    tab: process.env.GOOGLE_SHEET_LICENSE_TAB || "LicenseKeys",
    forbiddenTabs: ["PublishedConfigs"],
    mode: process.env.KEY_MODE?.toUpperCase() === "STOCK" ? "STOCK" : "GENERATE",
    newStatus: process.env.SHEET_NEW_STATUS || "unused",
    stockStatuses: ["unused", "available", "new", "stock", "chuaban", ""],
    timezone: process.env.SHEET_TIMEZONE || "Asia/Ho_Chi_Minh",
    aliases: {
      key: ["key", "licensekey", "serial", "khoa", "makey"],
      hwid: ["hwid", "deviceid", "machineid"],
      createdAt: ["createdat", "created", "ngaytao"],
      expiresAt: ["expiresat", "expires", "expiry", "expirydate", "ngayhethan", "hethan"],
      status: ["status", "trangthai"],
      note: ["note", "ghichu"],
      lastSeen: ["lastseen"],
      plan: ["plan", "type", "loai", "goi", "loaigoi", "package"],
      days: ["days", "duration", "songay", "ngay", "thoihan"],
      orderId: ["orderid", "ordercode", "madon", "order"],
      email: ["email", "customeremail", "mail"],
      soldAt: ["soldat", "ngayban", "solddate", "purchasedat"],
    },
    newColumnHeaders: {
      status: "Status",
      expiresAt: "ExpiresAt",
      createdAt: "CreatedAt",
      plan: "Plan",
      days: "Days",
      orderId: "OrderId",
      email: "Email",
      soldAt: "SoldAt",
    },
    retry: { attempts: 4, baseMs: 600 },
    revokeMode: process.env.REVOKE_MODE?.toUpperCase() === "OFF" ? "OFF" : "MANUAL",
  },
  alerts: {
    email: process.env.ADMIN_ALERT_EMAIL || "",
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    windowMs: 5 * 60 * 1000,
  },
  nextauthUrl: process.env.NEXTAUTH_URL || "http://localhost:3000",
  nextauthSecret: process.env.NEXTAUTH_SECRET || "change-me-in-production",
};

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = { ...DEFAULTS };
  return cachedConfig;
}

export function setConfig(config: Partial<AppConfig>) {
  const base = getConfig();
  cachedConfig = { ...base, ...config };
  if (config.site) cachedConfig.site = { ...base.site, ...config.site };
  if (config.payment) cachedConfig.payment = { ...base.payment, ...config.payment };
  if (config.email) cachedConfig.email = { ...base.email, ...config.email };
  if (config.admin) cachedConfig.admin = { ...base.admin, ...config.admin };
  if (config.business) cachedConfig.business = { ...base.business, ...config.business };
  if (config.packages) cachedConfig.packages = config.packages;
}

export function getPackageById(id: string): PackageConfig | undefined {
  return getConfig().packages.find((p) => p.id === id);
}

export function getActivePackages(): PackageConfig[] {
  return getConfig().packages
    .filter((p) => p.active)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

export function getPrimaryColor(): string {
  return getConfig().site.primaryColor;
}

export function getSiteName(): string {
  return getConfig().site.siteName;
}

export function isSandbox(): boolean {
  return getConfig().payment.sandbox;
}

export function getPaymentGateway(): "mock" | "sepay" | "casso" {
  return getConfig().payment.gateway;
}
