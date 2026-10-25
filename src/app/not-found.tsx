import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <div className="text-7xl font-extrabold text-[#ff6b6b] mb-2">404</div>
      <h1 className="text-2xl font-bold mb-2">Không tìm thấy trang</h1>
      <p className="text-zinc-500 mb-6">Trang bạn tìm không tồn tại hoặc đã được di chuyển.</p>
      <Link href="/" className="px-6 py-2.5 rounded-full bg-[#ff6b6b] text-white font-medium hover:bg-[#ff5252]">
        Về trang chủ
      </Link>
    </div>
  );
}
