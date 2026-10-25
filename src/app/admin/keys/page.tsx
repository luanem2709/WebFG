import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { isSheetConfigured } from "@/lib/google-sheets";
import { getSheetStatus, type SheetStatus } from "@/lib/license-sheet";
import { OrderActions } from "@/components/admin/actions";

export default async function KeysPage() {
  await guardAdmin();

  const configured = isSheetConfigured();
  let status: SheetStatus | null = null;
  let error = "";
  if (configured) {
    try {
      status = await getSheetStatus();
    } catch (e) {
      error = e instanceof Error ? e.message : "Lỗi không xác định";
    }
  }

  const orders = await prisma.order.findMany({
    where: { status: "PAID" },
    include: { package: true },
    orderBy: { paidAt: "desc" },
    take: 100,
  });
  const missing = orders.filter((o) => !o.licenseKey).length;

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Quản lý key</h1>
        <p className="text-zinc-500">Key được ghi vào tab LicenseKeys của Google Sheet KeyFG</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
          <p className="text-xs text-zinc-500">Kết nối Google Sheet</p>
          <p className={`text-lg font-bold mt-1 ${status ? "text-green-600" : "text-red-600"}`}>
            {!configured ? "Chưa cấu hình" : status ? "Đang hoạt động" : "Lỗi"}
          </p>
          {error && <p className="text-xs text-red-600 mt-1 break-words">{error}</p>}
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
          <p className="text-xs text-zinc-500">Chế độ / định dạng key</p>
          <p className="text-lg font-bold mt-1">{status?.mode ?? "—"}</p>
          <p className="text-xs font-mono text-zinc-500">{status ? status.formatText + (status.formatLearned ? " (học từ sheet)" : " (mặc định)") : ""}</p>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
          <p className="text-xs text-zinc-500">{status?.stockAvailable !== undefined ? "Key tồn kho còn lại" : "Đơn đã trả tiền chưa có key"}</p>
          <p className="text-lg font-bold mt-1">{status?.stockAvailable !== undefined ? status.stockAvailable : missing}</p>
        </div>
      </div>

      {status && status.missing.length > 0 && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Các cột sau sẽ được tự thêm vào bên phải của tab khi cấp key lần đầu: {status.missing.join(", ")}
        </div>
      )}

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Mã đơn</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Khách hàng</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Gói</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Key</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Hết hạn</th>
              <th className="p-3 text-right text-zinc-500 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="p-3 font-mono text-xs">{o.orderCode}</td>
                <td className="p-3">{o.customerEmail}</td>
                <td className="p-3">{o.package.name}</td>
                <td className="p-3 font-mono text-xs select-all">
                  {o.licenseKey || <span className="text-red-600">Chưa có key</span>}
                </td>
                <td className="p-3 text-xs text-zinc-500">{o.expiresAt ? o.expiresAt.toLocaleString("vi-VN") : "—"}</td>
                <td className="p-3">
                  <OrderActions id={o.id} status={o.status} hasKey={Boolean(o.licenseKey)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.length === 0 && <div className="text-center py-10 text-zinc-500">Chưa có đơn nào được thanh toán</div>}
    </AdminLayout>
  );
}
