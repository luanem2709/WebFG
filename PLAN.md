# PLAN.md — funnygame Website

## 1. Mục tiêu
Xây dựng website bán duy nhất 1 sản phẩm: gói sử dụng dịch vụ/tài khoản **funnygame** (tính theo thời gian). Khách chọn gói → nhập email → tạo đơn → hiện QR VietQR → chuyển khoản → webhook xác nhận tự động → kích hoạt gói → gửi email xác nhận → trang tài khoản hiển thị thời gian còn lại theo đếm ngược realtime.

## 2. Giả định (ghi vào README)
- Dùng **SQLite** qua Prisma (file duy nhất, dễ deploy, không cần DB server riêng).
- Cổng thanh toán mặc định là **mock (SANDBOX)**. Adapter SePay/Casso viết sẵn, bật bằng `.env`.
- Gửi mail qua **nodemailer SMTP** (config qua `.env`). Có chế độ in log thay thế gửi mail thật trong dev.
- Admin đăng nhập bằng tài khoản cứng trong `.env` (ADMIN_USER / ADMIN_PASS), password băm bcrypt.
- Session dùng cookie HttpOnly + signed (iron-session-style đơn giản) hoặc JWT cookie.
- Magic link/OTP qua email không cần mật khẩu.
- Realtime đơn hàng dùng **polling** (3 giây/lần) thay vì WebSocket (đơn giản, ổn định trên Vercel/serverless).
- Cron job chạy qua route API được gọi bởi external cron (Vercel Cron) hoặc interval in-memory trong dev.

## 3. Kiến trúc
- **Frontend:** Next.js 16 App Router, TypeScript, Tailwind CSS 4, framer-motion, lucide-react.
- **Backend:** Next.js Route APIs + Server Actions.
- **Database:** Prisma ORM + SQLite (`prisma/dev.db`).
- **Config:** `src/lib/config.ts` là NÊN DANH CHÍNH (một file duy nhất), các giá trị admin chỉnh được được lưu trong bảng `Config` (key/value) và ghi đè defaults.
- **Payment:** Adapter pattern (`src/lib/payment/adapter.ts`), có `sepay.ts`, `casso.ts`, `mock.ts`.
- **Email:** `src/lib/email.ts` (nodemailer SMTP + dev log fallback).
- **Auth:** Magic link + admin session cookie.

## 4. Cấu trúc thư mục
```
src/
  app/
    layout.tsx
    globals.css
    page.tsx                      # Landing page
    (admin)/
      layout.tsx                  # Admin layout (cần login)
      login/page.tsx
      dashboard/page.tsx
      orders/page.tsx
      customers/page.tsx
      packages/page.tsx
      config/page.tsx
      logs/page.tsx
    account/
      page.tsx                    # Tra cứu bằng email + mã đơn, hoặc magic-link session
      verify/page.tsx             # Xác thực magic link
    checkout/
      page.tsx                    # Trang thanh toán QR
    api/
      packages/route.ts           # GET danh sách gói (public)
      orders/route.ts             # POST tạo đơn, GET danh sách đơn (admin)
      orders/[id]/route.ts        # GET chi tiết đơn (polling), POST admin hành động
      webhook/sepay/route.ts
      webhook/casso/route.ts
      webhook/mock/route.ts       # Gửi mock webhook để test
      auth/magic-link/route.ts    # POST yêu cầu magic link, GET verify token
      admin/config/route.ts       # CRUD config
      admin/...                   # Các route admin khác nếu cần
  components/
    ui/                           # button, input, card, badge, etc.
    landing/                      # Hero, Pricing, Benefits, FAQ, Contact, Footer
    checkout/                     # QRCode, OrderSummary
    account/                      # Countdown, ProgressBar, StatusBadge
    admin/                        # Table, Form, StatCard
  lib/
    config.ts                     # MỘT FILE CẤU HÌNH DUY NHẤT (defaults + DB override)
    prisma.ts                     # Prisma client singleton
    payment/
      adapter.ts                  # Interface
      mock.ts                     # Mock adapter (SANDBOX)
      sepay.ts
      casso.ts
      vietqr.ts                   # Tạo chuỗi VietQR + ảnh QR
    email.ts                      # Gửi mail (SMTP + log fallback)
    auth.ts                       # Magic link, session, hash password
    rate-limit.ts                 # In-memory rate limiter
    cron.ts                       # Hủy đơn chờ, gửi mail nhắc hết hạn
  types/
    index.ts
  scripts/
    seed.ts                       # Seed gói + admin + config mẫu
```

## 5. Schema Database (Prisma + SQLite)
```prisma
enum OrderStatus { PENDING PAID FAILED EXPIRED CANCELED REFUNDED NEED_REVIEW }
enum PackageLabel { NEW POPULAR SAVING NONE }
enum LogLevel { INFO WARN ERROR }

model Package {
  id          String    @id @default(uuid())
  name        String
  days        Int
  price       Int       # VNĐ
  active      Boolean   @default(true)
  label       PackageLabel @default(NONE)
  sortOrder   Int       @default(0)
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Order {
  id            String   @id @default(uuid())
  orderCode     String   @unique
  packageId     String
  package       Package  @relation(fields: [packageId], references: [id])
  customerEmail String
  customerName  String?
  amount        Int      # VNĐ (định giá đơn)
  paidAmount    Int?     # VNĐ (thực tế nhận được)
  status        OrderStatus @default(PENDING)
  paidAt        DateTime?
  activatedAt   DateTime?
  expiresAt     DateTime?
  webhookPayload Json?
  adminNote     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Customer {
  id          String   @id @default(uuid())
  email       String   @unique
  name        String?
  active      Boolean  @default(false)
  activatedAt DateTime?
  expiresAt   DateTime?
  locked      Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Config {
  key   String @id
  value String
}

model Admin {
  id        String   @id @default(uuid())
  username  String   @unique
  password  String   # bcrypt hash
  createdAt DateTime @default(now())
}

model TransactionLog {
  id        String   @id @default(uuid())
  type      String   # order_created, webhook_received, payment_confirmed, etc.
  source    String   # sepay, casso, mock, admin, system
  payload   Json?
  status    String   # success, failed, pending
  message   String?
  createdAt DateTime @default(now())
}

model EmailLog {
  id        String   @id @default(uuid())
  to        String
  type      String   # order_confirm, expiry_reminder, expiry_notice, magic_link, admin_alert
  subject   String
  status    String   # sent, failed
  sentAt    DateTime?
  error     String?
  createdAt DateTime @default(now())
}
```

## 6. Danh sách API (public + admin + webhook)
| Method | Route | Mô tả |
|--------|-------|-------|
| GET | /api/packages | Lấy danh sách gói đã bật (public) |
| POST | /api/orders | Tạo đơn mới (public) |
| GET | /api/orders/[id] | Chi tiết đơn + trạng thái (polling, public) |
| GET | /api/orders | Danh sách đơn (admin) |
| POST | /api/orders/[id]/action | Admin: xác nhận/hủy/hoàn tất/hoàn tiền |
| POST | /api/webhook/sepay | Webhook SePay |
| POST | /api/webhook/casso | Webhook Casso |
| POST | /api/webhook/mock | Gửi mock webhook (test) |
| POST | /api/auth/magic-link | Yêu cầu magic link |
| GET | /api/auth/magic-link/verify | Xác thực token magic link |
| POST | /api/admin/login | Đăng nhập admin |
| POST | /api/admin/logout | Đăng xuất |
| GET | /api/admin/config | Lấy toàn bộ config |
| PUT | /api/admin/config/[key] | Cập nhật một config |
| GET | /api/admin/customers | Danh sách khách |
| POST | /api/admin/customers/[id]/adjust-days | Cộng/trừ ngày thủ công |
| POST | /api/admin/customers/[id]/toggle-lock | Khóa/mở khách |
| GET | /api/admin/logs | Nhật ký giao dịch |
| GET | /api/cron/expire-orders | Hủy đơn quá hạn (cron gọi) |
| GET | /api/cron/expiry-reminder | Gửi mail nhắc hết hạn (cron gọi) |

## 7. Config (một file duy nhất: src/lib/config.ts)
Defaults (có thể ghi đè bằng bảng `Config` trong DB, admin chỉnh trên trang `/admin/config`):
- `siteName`: "funnygame"
- `siteTitle`: "funnygame - Gói sử dụng dịch vụ"
- `primaryColor`: "#ff6b6b"
- `contactEmail`, `contactPhone`, `contactAddress`
- `packages`: [{id, name, days, price, active, label}]
- `paymentGateway`: "mock" | "sepay" | "casso"
- `sepayApiKey`, `sepaySecret`, `cassoApiKey`, `cassoSecret` (từ .env)
- `expiryRemindDays`: 3 (nhắc trước 3 ngày)
- `orderHoldMinutes`: 15 (hủy đơn nếu chưa thanh toán sau 15 phút)
- `sandbox`: true/false
- `emailFrom`, `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass` (từ .env)
- `adminUser`, `adminPassHash` (từ .env)

## 8. Bước thực hiện
1. Viết PLAN.md ✓
2. Cài dependencies: prisma, @prisma/client, nodemailer, qrcode, bcryptjs, etc.
3. Tạo schema.prisma, seed.ts, .env.example
4. Tạo lib: config.ts, prisma.ts, payment adapters, vietqr.ts, email.ts, auth.ts, rate-limit.ts, cron.ts
5. Tạo API routes
6. Tạo components + pages (landing, checkout, account, admin)
7. Tạo cron route + seed
8. Test end-to-end (mock payment)
9. Viết README.md
10. Lint + build

## 9. Luồng kiểm thử (end-to-end)
1. Truy cập landing → chọn gói 1 tháng → nhấn "Mua ngay".
2. Nhập email → tạo đơn → hiện QR VietQR + mã đơn.
3. Gửi mock webhook (đúng mã đơn + số tiền) → đơn chuyển PAID → kích hoạt → email xác nhận.
4. Truy cập `/account` với email + mã đơn → xem ngày hết hạn + đồng hồ đếm ngược.
5. Mua thêm gói khi còn hạn → thời gian cộng dồn.
6. Đơn chờ quá 15 phút không thanh toán → cron hủy tự động.
7. Admin dashboard → xem doanh tư, đơn hàng, khách sắp hết hạn → cấu hình gói.
