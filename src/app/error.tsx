"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-2xl font-bold mb-2">Đã có lỗi xảy ra</h1>
      <p className="text-zinc-500 mb-6">Vui lòng thử lại. Nếu lỗi tiếp diễn, hãy liên hệ hỗ trợ.</p>
      <button
        onClick={reset}
        className="px-6 py-2.5 rounded-full bg-[#ff6b6b] text-white font-medium hover:bg-[#ff5252] cursor-pointer"
      >
        Thử lại
      </button>
    </div>
  );
}
