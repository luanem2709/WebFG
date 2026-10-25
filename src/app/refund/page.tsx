import type { Metadata } from "next";
import Link from "next/link";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Chính sách hoàn tiền" };

export default function Page() {
  const { site } = getConfig();
  return (
    <main className="max-w-3xl mx-auto py-12 px-4">
      <Link href="/" className="text-sm font-medium text-[#ff6b6b] hover:underline">&larr; Về trang chủ</Link>
      <h1 className="text-3xl font-bold mt-6 mb-8">Chính sách hoàn tiền</h1>
      <div className="space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <section>
          <h2 className="font-bold text-base mb-2">1. Trường hợp được hoàn tiền</h2>
          <p>Hoàn tiền khi bạn thanh toán nhưng không nhận được key do lỗi hệ thống và chúng tôi không thể khắc phục, hoặc chuyển khoản trùng cho cùng một đơn.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">2. Trường hợp không hoàn tiền</h2>
          <p>Key đã được kích hoạt và sử dụng; key bị khóa do vi phạm điều khoản; thay đổi ý định sau khi đã nhận key.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">3. Quy trình</h2>
          <p>Gửi mã đơn hàng và email đặt hàng đến địa chỉ hỗ trợ bên dưới. Yêu cầu hợp lệ sẽ được xử lý trong vòng 3-5 ngày làm việc.</p>
        </section>
        <section>
          <h2 className="font-bold text-base mb-2">Liên hệ</h2>
          <p>Email: {site.contactEmail} &bull; Điện thoại: {site.contactPhone}</p>
        </section>
      </div>
    </main>
  );
}
