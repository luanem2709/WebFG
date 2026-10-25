import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Điều khoản sử dụng" };

export default function Page() {
  const { site } = getConfig();
  return (
    <main className="max-w-3xl mx-auto py-12 px-4">
      <Link href="/" className="text-sm font-medium text-[#ff6b6b] hover:underline">&larr; Về trang chủ</Link>
      <h1 className="text-3xl font-bold mt-6 mb-8">Điều khoản sử dụng</h1>
      <div className="space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="font-bold text-base mb-2">1. Dịch vụ</h2>
          <p>funnygame cung cấp key kích hoạt phần mềm theo thời hạn (gói 1 tháng, 3 tháng). Thời hạn tính từ thời điểm thanh toán được xác nhận; mua thêm khi còn hạn sẽ được cộng dồn.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">2. Thanh toán</h2>
          <p>Thanh toán bằng chuyển khoản VietQR với đúng số tiền và nội dung chuyển khoản là mã đơn hàng. Chuyển sai nội dung hoặc sai số tiền có thể khiến đơn phải duyệt thủ công, thời gian xử lý lâu hơn.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">3. Key kích hoạt</h2>
          <p>Mỗi key dành cho một thiết bị và không được chia sẻ, bán lại. Chúng tôi có quyền khóa key vi phạm mà không hoàn tiền.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">4. Trách nhiệm</h2>
          <p>Dịch vụ được cung cấp &ldquo;như hiện có&rdquo;. Chúng tôi nỗ lực duy trì hoạt động ổn định nhưng không cam kết không gián đoạn.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">5. Thay đổi</h2>
          <p>Điều khoản có thể được cập nhật; phiên bản mới có hiệu lực khi đăng tải trên trang này.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">Liên hệ</h2>
          <p>Email: {site.contactEmail} &bull; Điện thoại: {site.contactPhone}</p>
        </section>
      </div>
    </main>
  );
}

