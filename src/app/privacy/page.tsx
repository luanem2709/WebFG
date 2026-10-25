import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Chính sách bảo mật" };

export default function Page() {
  const { site } = getConfig();
  return (
    <main className="max-w-3xl mx-auto py-12 px-4">
      <Link href="/" className="text-sm font-medium text-[#ff6b6b] hover:underline">&larr; Về trang chủ</Link>
      <h1 className="text-3xl font-bold mt-6 mb-8">Chính sách bảo mật</h1>
      <div className="space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="font-bold text-base mb-2">1. Dữ liệu thu thập</h2>
          <p>Chúng tôi lưu email, tên (nếu bạn nhập), lịch sử đơn hàng và key kích hoạt để cung cấp dịch vụ và hỗ trợ.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">2. Mục đích sử dụng</h2>
          <p>Dữ liệu chỉ dùng để xử lý đơn hàng, gửi email xác nhận/nhắc hết hạn và hỗ trợ khách hàng. Chúng tôi không bán dữ liệu cho bên thứ ba.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">3. Thanh toán</h2>
          <p>Chúng tôi không lưu thông tin thẻ hay tài khoản ngân hàng của bạn; chỉ nhận thông báo giao dịch từ cổng thanh toán.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">4. Quyền của bạn</h2>
          <p>Bạn có thể yêu cầu xem hoặc xóa dữ liệu cá nhân bằng cách liên hệ qua email bên dưới.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">Liên hệ</h2>
          <p>Email: {site.contactEmail} &bull; Điện thoại: {site.contactPhone}</p>
        </section>
      </div>
    </main>
  );
}
