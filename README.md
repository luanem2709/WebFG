# funnygame – Website bán gói sử dụng

Next.js 16 (App Router) + Prisma/SQLite + Tailwind 4. Luồng: chọn gói → nhập email → tạo đơn → QR VietQR → webhook xác nhận → kích hoạt → email → trang tài khoản đếm ngược realtime.

## Chạy dự án

```bash
npm install
cp .env.example .env        # chỉnh giá trị nếu cần
npm run prisma:setup        # generate + migrate + seed
npm run dev                 # http://localhost:3000
```

Admin: `/admin/login` (mặc định `admin` / `Admin123!`, đổi trong `.env`).

## Giả định
- SQLite (`prisma/dev.db`), không cần DB server.
- Cổng thanh toán mặc định **mock (sandbox)**: trang checkout có nút "Mô phỏng thanh toán"; endpoint mock tự khóa khi `SANDBOX=false` hoặc gateway khác `mock`. SePay xác thực qua header `Authorization: Apikey <SEPAY_API_KEY>`, Casso qua header `secure-token` (= `CASSO_SECRET`). Cần test với webhook thật trước khi chạy production.
- Email qua nodemailer SMTP; `EMAIL_DEV_LOG=true` chỉ in log ra console (và Magic Link hiện trực tiếp trên trang để test).
- Đơn hàng cập nhật bằng polling 3 giây.
- Cache Components tắt vì ứng dụng chủ yếu động (DB/cookie).

## Key Google Sheet (KeyFG — dùng sheet có sẵn)

Sau khi thanh toán thành công, web tạo key và **thêm một dòng ở cuối tab `LicenseKeys`** của sheet KeyFG (ID đặt trong `.env` là `GOOGLE_SHEET_ID`, không hard-code). Web **chỉ** ghi tab `LicenseKeys`; tab `PublishedConfigs` bị chặn cứng trong code (không đọc, không ghi, không lấy cột `Data`/`PublisherKey`). Web không đổi tên tab, không đổi thứ tự cột, không xóa/sửa dòng có sẵn.

### Cách khớp cột (tự nhận diện theo tiêu đề dòng 1)
Không phân biệt hoa/thường, bỏ dấu/khoảng trắng/ký tự đặc biệt. Bảng ánh xạ nằm ở `licenseSheet.aliases` trong `src/lib/config.ts` và sửa tay được.

| Trường | Tên cột chấp nhận (ví dụ) | Trong sheet hiện tại |
|---|---|---|
| key | Key, LicenseKey, Serial, Khóa | **Key** (có sẵn) |
| hwid | HWID, DeviceId | **HWID** (có sẵn, web để trống) |
| createdAt | CreatedAt, Ngày tạo | **CreatedAt** (có sẵn) |
| expiresAt | ExpiresAt, Expiry, Ngày hết hạn | **ExpiresAt** (có sẵn) |
| status | Status, Trạng thái | **Status** (có sẵn) |
| note, lastSeen | Note/Ghi chú, LastSeen | có sẵn, **web để trống** |
| plan | Plan, Type, Loại, Gói | **thêm mới**: `Plan` |
| days | Days, Duration, Số ngày, Ngày | **thêm mới**: `Days` |
| orderId | OrderId, Mã đơn | **thêm mới**: `OrderId` |
| email | Email, Mail | **thêm mới**: `Email` |
| soldAt | SoldAt, Ngày bán | **thêm mới**: `SoldAt` |

Các cột "thêm mới" được tự thêm ở **bên phải cùng** của dòng tiêu đề trong lần cấp key đầu tiên (không chèn giữa các cột cũ). Cột nào web không hiểu thì để trống.

### Định dạng key
Khi chạy, web đọc tối đa 10 key gần nhất trong cột Key để học định dạng (dạng xuất hiện nhiều nhất). Với dữ liệu hiện tại, định dạng học được là **`FG-XXXX-XXXX-XXXX`** (chữ in hoa + số, 4 ký tự mỗi đoạn; vài key đặt tay như `FG-LUAN-EM01-2004` vẫn cùng khuôn). Nếu tab trống/không suy ra được thì dùng mặc định `FG-1M-XXXX-XXXX-XXXX` (1 tháng) và `FG-3M-XXXX-XXXX-XXXX` (3 tháng). Ký tự ngẫu nhiên dùng `crypto.randomInt`.

### Giá trị ghi cho dòng mới (chế độ GENERATE – mặc định)
`CreatedAt` = lúc bán, `ExpiresAt` = `CreatedAt` + số ngày của gói (khớp cách dữ liệu hiện có tính hạn), `Status` = `unused` (đổi bằng `SHEET_NEW_STATUS`), `HWID` trống, `Note`/`LastSeen` trống, `Plan` = `1M`/`3M`, `Days` = 30/90, `OrderId`, `Email`, `SoldAt`. Ngày giờ theo múi giờ `SHEET_TIMEZONE` (mặc định Asia/Ho_Chi_Minh), dạng `yyyy-MM-dd HH:mm:ss`.

### Chế độ
- `KEY_MODE=GENERATE` (mặc định): sinh key mới và append.
- `KEY_MODE=STOCK`: lấy một key **chưa bán có sẵn** trong sheet (Status chưa dùng, HWID trống, `OrderId` trống, có `Plan`/`Days` khớp gói) và chỉ ghi vào các cột do web quản lý (`OrderId`, `Email`, `SoldAt`) — **không sửa Status/ExpiresAt/HWID**. Hết hàng thì đơn ở trạng thái "chưa có key" và admin thấy cảnh báo.

### Quy tắc an toàn
- Append đúng 1 dòng; kiểm tra key chưa tồn tại trước khi ghi; sau khi ghi **đọc lại để xác nhận** rồi mới giao cho khách.
- Idempotent theo mã đơn (tìm `OrderId` trong sheet trước; mỗi đơn chỉ 1 key). Có khóa tuần tự chống 2 đơn ghi cùng lúc (trong một tiến trình).
- Retry có backoff khi Google lỗi (429/5xx); không tự retry thao tác append để tránh ghi trùng — thay vào đó đọc lại sheet. Đơn còn thiếu key được cron (`/api/cron/expire-orders`) cấp lại tối đa 7 ngày và gửi email key.
- Key Service Account chỉ nằm trong biến môi trường server, không vào git/client.

### Kiểm tra kết nối
```bash
npm run check-sheet              # chỉ-đọc (mặc định): in cách khớp cột + định dạng key
npm run check-sheet -- --write   # ghi thử 1 dòng test (FG-TEST-...) rồi xóa đúng dòng đó
npm run test:schema              # test offline logic khớp cột / học định dạng
npm run test:sheet               # test end-to-end với Google API giả (không đụng sheet thật)
```
Admin xem trạng thái tại **/admin/keys** (kết nối, chế độ, định dạng, tồn kho, đơn chưa có key, nút "Cấp key").

### Việc bạn cần làm (một lần)
1. Vào Google Cloud Console → tạo project → **bật Google Sheets API**.
2. IAM & Admin → Service Accounts → tạo Service Account → Keys → **Add key → JSON**.
3. Mở sheet **KeyFG** → Share → thêm email service account (`...@...iam.gserviceaccount.com`) với quyền **Editor** (chỉ sheet này).
4. Dán nội dung JSON (một dòng) vào `.env`: `GOOGLE_SERVICE_ACCOUNT_JSON='{...}'` (hoặc base64 vào `GOOGLE_SERVICE_ACCOUNT_B64`).
5. Chạy `npm run check-sheet`, xem bảng khớp cột; nếu ổn chạy thêm `-- --write`.
6. **Xác nhận với ứng dụng đang đọc sheet** rằng key mới (Status `unused`, ExpiresAt = ngày bán + số ngày) được chấp nhận; nếu app dùng giá trị Status khác cho key chưa kích hoạt, đặt `SHEET_NEW_STATUS`.

### Giả định đã chọn (an toàn nhất khi thiếu thông tin)
- Tab đầu tiên hiện có cột `Key, HWID, CreatedAt, ExpiresAt, Status, Note, LastSeen` được coi là `LicenseKeys`; trong dữ liệu mẫu chỉ thấy Status `used`/`expired`, nên giá trị cho key mới (`unused`) là suy đoán — cần bạn xác nhận (mục 6).
- Hạn `ExpiresAt` tính từ lúc bán (dữ liệu hiện có tính từ `CreatedAt`), không tính từ lúc kích hoạt.
- Ở production, nếu chưa cấu hình sheet thì **không phát key local** (key local không hợp lệ với ứng dụng đọc sheet); đơn giữ trạng thái "chưa có key" cho tới khi cấp được. Đặt `ALLOW_LOCAL_KEYS=true` để ép dùng key local (chỉ nên dùng khi thử nghiệm).
- `check-sheet` mặc định chỉ-đọc; ghi thử cần cờ `--write`. Dòng test có `Status=test` và tồn tại trong vài giây.

## Nghiệp vụ nâng cao (nhóm B)

### Đơn trả tiền muộn
Khi webhook báo tiền về cho đơn **không còn PENDING**:
| Trạng thái đơn | Hệ thống làm gì |
|---|---|
| EXPIRED / CANCELED | **Không tự kích hoạt.** Chuyển `NEED_REVIEW` (lý do `LATE_PAYMENT`), lưu số tiền thực nhận, mã giao dịch, thời điểm nhận; ghi nhật ký; báo admin |
| PAID / REFUNDED / NEED_REVIEW | Không kích hoạt lần 2; ghi nhật ký `payment_extra`; báo admin ("nhận thêm tiền") |
| PENDING nhưng lệch số tiền | `NEED_REVIEW` (lý do `AMOUNT_MISMATCH`); báo admin |

Trong **Admin → Đơn hàng**, đơn trả muộn có nhãn **"Trả tiền muộn"** và 2 nút: **Kích hoạt** (chạy luồng fulfillment bình thường: cộng hạn, tạo key, gửi email) hoặc **Hoàn tiền** (→ `REFUNDED`, không trừ hạn vì chưa từng kích hoạt). Đơn `CANCELED`/`REFUNDED` không thể kích hoạt lại bằng tay (cố ý).

### Chống trùng theo mã giao dịch ngân hàng
Bảng `PaymentTransaction` (`gatewayName` + `transactionId` **unique ở tầng DB**, `orderId` nullable, `amount`, `rawContentHash`, `receivedAt`, `result`). Mọi webhook SePay/Casso/mock ghi bảng này **trước** khi xử lý đơn; trùng `transactionId` → trả 200 `duplicate` và bỏ qua. Giao dịch không khớp mã đơn vẫn được lưu (`orderId` null) và báo admin. Chỉ lưu **hash** nội dung webhook, không lưu API key hay payload thô. Nếu cổng không gửi mã giao dịch, dùng hash nội dung làm mã. Mock dùng `MOCK-<mã đơn>` (mỗi đơn chỉ "trả tiền" mock một lần).

### Hủy / hoàn tiền tự trừ hạn
Admin chuyển đơn **PAID → REFUNDED/CANCELED**: hộp xác nhận hiện rõ số ngày sẽ trừ, hạn hiện tại và hạn mới. Mặc định trừ đúng số ngày của gói; hạn **không thấp hơn hiện tại** (trừ quá → hết hạn ngay; khách đã hết hạn thì giữ nguyên). Có checkbox **"Không trừ hạn"**. Chạy trong 1 transaction DB, chặn thao tác 2 lần (kể cả song song) bằng so sánh-và-đổi trạng thái; nhật ký ghi ai làm, đơn nào, trừ bao nhiêu ngày, hạn trước/sau.

### Thu hồi key
- **Hiện trạng:** web **không bao giờ sửa/xóa dòng có sẵn** trong Google Sheet. Khi khách bị khóa, đơn bị hoàn/hủy hoặc gói hết hạn, key vẫn nằm trên sheet.
- **Cách làm:** trang **Admin → Thu hồi key** (`/admin/revoke`) liệt kê các key cần thu hồi (đơn hoàn tiền/hủy, khách bị khóa, gói hết hạn) kèm **số dòng trong sheet**, Status/ExpiresAt hiện tại (đọc-only), các giá trị Status đang có trong sheet, nút **sao chép key / key+dòng** và **"Đã xử lý"** (chỉ ẩn khỏi danh sách, không sửa sheet).
- **Cấu hình:** `REVOKE_MODE=MANUAL` (mặc định) hoặc `OFF`. Không có chế độ tự ghi đè.
- **Giả định:** ứng dụng đọc sheet là nơi quyết định key còn hiệu lực. Cột `ExpiresAt`/`Status` có thể là cách app kiểm tra, nhưng web chưa biết chắc.
- **Câu hỏi cần xác nhận với người làm ứng dụng đọc sheet:**
  1. App có tự kiểm tra `ExpiresAt`/`Days` mỗi lần mở không, hay chỉ kiểm tra lúc kích hoạt?
  2. Có giá trị `Status` hoặc cột nào đánh dấu "thu hồi/vô hiệu" không (ví dụ `revoked`, `banned`)? Nếu có, admin sẽ đặt giá trị đó thủ công theo trang Thu hồi key.
  3. Khi app thấy key `expired`/`used` + HWID khác thì xử lý thế nào?

### Thông báo cho admin
Module `src/lib/notify-admin.ts`: gửi qua **email** (`ADMIN_ALERT_EMAIL`, dùng SMTP sẵn có) và **Telegram** tùy chọn (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Không đặt kênh nào thì bỏ qua, không lỗi. Sự kiện: đơn NEED_REVIEW (lệch tiền / trả tiền muộn), giao dịch không khớp đơn, nhận thêm tiền, cấp key thất bại / hết lần retry, webhook sai xác thực ≥ 5 lần / 10 phút, gửi email khách thất bại, đơn PAID chưa có key quá 10 phút (cron).
- **Chống spam:** cùng loại trong 5 phút gộp thành 1 (mốc lưu trong bảng `AlertState`); cron gửi bản tổng hợp cho phần bị gộp.
- **An toàn nội dung:** chỉ mã đơn, email che bớt (`a***@domain`), số tiền, lý do, link admin. Có bộ lọc cuối che email/key `FG-...`/`Apikey ...`/secret.
- Lỗi khi gửi thông báo được bọc try/catch và ghi nhật ký, **không làm hỏng luồng thanh toán**.

### Hướng dẫn sử dụng sản phẩm
Admin → **Cấu hình** điền 3 khóa (lưu trong DB): `downloadUrl` (link tải), `guideText` (hướng dẫn kích hoạt, mỗi dòng một bước), `supportContact` (Zalo/Telegram/email). Trang **/guide** (có trong menu, footer, màn hình thanh toán thành công, trang tài khoản) và **email xác nhận đơn / email gửi key** (link tải, tối đa 5 bước, hỗ trợ, hạn dùng) đều lấy từ cấu hình này — không hard-code. **Bạn phải điền** — chưa điền thì trang dùng 5 bước mặc định, email ghi "liên hệ hỗ trợ để nhận link tải", và trang Cấu hình hiện cảnh báo.

### Biến môi trường mới
`ADMIN_ALERT_EMAIL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `REVOKE_MODE` (MANUAL | OFF). (Xem `.env.example`.)

### Kiểm thử
`npm run test:flow` — dùng DB SQLite tạm (`prisma/test-flow.db`, tự xóa), Telegram giả, gateway/adapter mock và Google API lỗi giả; không cần mạng. Bao gồm: trả tiền muộn (EXPIRED/CANCELED), trùng transactionId (4 webhook song song), nhận thêm tiền, giao dịch không khớp, lệch tiền, hoàn tiền trừ hạn (kể cả trừ quá), hoàn 2 lần song song, gộp thông báo, che dữ liệu nhạy cảm, key thất bại. Cùng với `npm run test:schema` và `npm run test:sheet`.

### Giả định đã chọn (nhóm B)
- Webhook hợp lệ luôn trả **200** (kể cả duplicate/unmatched/NEED_REVIEW) để cổng không gửi lại vô hạn; chỉ sai xác thực mới trả 401.
- Hoàn tiền không tự chuyển tiền thật — đó là thao tác ngân hàng thủ công của admin.
- Đơn `CANCELED` không có tiền thì admin không thể "Hoàn tiền"; đơn nhận tiền muộn vào `NEED_REVIEW` mới hoàn được.
- 5 bước hướng dẫn mặc định là nội dung chung chung — hãy thay bằng `guideText` thật.
- Rate-limit/gộp thông báo chạy đúng với 1 instance; mốc gộp lưu DB nên an toàn khi restart.

### Việc admin còn phải làm
1. Điền `downloadUrl`, `guideText`, `supportContact` trong Admin → Cấu hình.
2. Đặt `ADMIN_ALERT_EMAIL` (+ Telegram nếu muốn) và cấu hình SMTP thật.
3. Hỏi người làm ứng dụng đọc sheet 3 câu ở mục "Thu hồi key" và thống nhất quy trình thu hồi.
4. Xem trang **Đơn hàng** (lọc NEED_REVIEW) và **Thu hồi key** hằng ngày; hoàn tiền thật qua ngân hàng.
5. Các việc nền tảng còn lại đã nêu ở các mục trên (tài khoản ngân hàng, SePay/Casso, Service Account, secret, cron...).

## Bảo mật
Đặt `ADMIN_SESSION_SECRET` dài, ngẫu nhiên (cookie phiên được ký HMAC); đổi `ADMIN_PASSWORD`; đặt `SANDBOX=false`; đặt `CRON_SECRET` và gọi cron kèm `Authorization: Bearer <secret>`.

## Cron
Gọi định kỳ (Vercel Cron hoặc cron ngoài):
- `GET /api/cron/expire-orders` – hủy đơn PENDING quá `orderHoldMinutes` và nhắc hết hạn.
- `GET /api/cron/expiry-reminder` – gửi mail nhắc trước `expiryRemindDays` ngày.

## Webhook
`POST /api/webhook/{mock|sepay|casso}` – body chứa `orderCode`, `amount`, `status`. Lệch số tiền → đơn `NEED_REVIEW` để admin duyệt tay.

## Lệnh
`npm run lint` · `npm run build` · `npm run prisma:seed`

## Triển khai
- Build standalone: `npm run build` rồi `node .next/standalone/server.js` (nhớ copy `.next/static` và `public`), hoặc dùng `Dockerfile` kèm volume cho SQLite (`DATABASE_URL=file:/app/data/prod.db`).
- **Không dùng Vercel/serverless với SQLite** (hệ thống file không ghi bền vững). Nếu cần serverless, chuyển Prisma sang Postgres.
- Health check: `GET /api/health`.
- Rate limit đang lưu trong bộ nhớ: chỉ đúng khi chạy 1 instance.

