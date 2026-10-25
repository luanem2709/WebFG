import type { Metadata } from "next";
import Link from "next/link";
import { getGuideSettings } from "@/lib/settings";
import { Header, Footer } from "@/components/landing";

export const metadata: Metadata = {
  title: "Hướng dẫn tải & kích hoạt",
  description: "Cách tải funnygame, kích hoạt key, xử lý lỗi thường gặp và liên hệ hỗ trợ.",
};

export const dynamic = "force-dynamic";

const FAQ = [
  ["Key báo không hợp lệ?", "Kiểm tra đã dán đủ và đúng key (phân biệt chữ O/0, I/1). Nếu vẫn lỗi, liên hệ hỗ trợ kèm mã đơn hàng."],
  ["Tôi muốn đổi thiết bị?", "Mỗi key gắn với một thiết bị. Liên hệ hỗ trợ kèm mã đơn để được hướng dẫn."],
  ["Mất key / chưa thấy email?", "Vào trang Tài khoản, tra cứu bằng email + mã đơn (hoặc Magic Link) để xem lại key. Kiểm tra cả thư mục spam."],
  ["Gia hạn thế nào?", "Mua thêm gói tại trang Mua gói khi còn hạn — thời gian được cộng dồn vào hạn hiện tại."],
];

export default async function GuidePage() {
  const g = await getGuideSettings();
  return (
    <div className="flex flex-col flex-1">
      <Header />
      <main className="max-w-3xl w-full mx-auto py-12 px-4 space-y-10">
        <div>
          <h1 className="text-3xl font-bold mb-2">Hướng dẫn tải &amp; kích hoạt</h1>
          <p className="text-zinc-500">Làm theo các bước dưới đây sau khi bạn nhận được key.</p>
        </div>

        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-6">
          <h2 className="font-bold text-lg mb-3">1. Tải phần mềm</h2>
          {g.downloadConfigured ? (
            <a
              href={g.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-2.5 rounded-full bg-[#ff6b6b] text-white font-medium hover:bg-[#ff5252]"
            >
              Tải funnygame
            </a>
          ) : (
            <p className="text-sm text-zinc-500">Link tải chưa được công bố trên trang này — vui lòng liên hệ hỗ trợ để nhận link: {g.supportContact}</p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-6">
          <h2 className="font-bold text-lg mb-3">2. Kích hoạt key</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            {g.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-bold text-lg mb-3">Câu hỏi thường gặp</h2>
          <div className="space-y-3">
            {FAQ.map(([q, a]) => (
              <div key={q} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                <h3 className="font-semibold mb-1">{q}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-6 text-sm">
          <h2 className="font-bold text-lg mb-2">Cần hỗ trợ?</h2>
          <p>
            Liên hệ: <strong>{g.supportContact}</strong>
          </p>
          <p className="mt-3 space-x-4">
            <Link href="/account" className="text-[#ff6b6b] hover:underline">Xem key của tôi</Link>
            <Link href="/checkout" className="text-[#ff6b6b] hover:underline">Mua / gia hạn</Link>
          </p>
        </section>
      </main>
      <Footer />
    </div>
  );
}
