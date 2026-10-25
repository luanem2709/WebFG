import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { formatVND } from "@/lib/payment/vietqr";
import { OrderActions } from "@/components/admin/actions";

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-green-100 text-green-700",
  PENDING: "bg-amber-100 text-amber-700",
  EXPIRED: "bg-gray-100 text-gray-700",
  CANCELED: "bg-red-100 text-red-700",
  REFUNDED: "bg-purple-100 text-purple-700",
  NEED_REVIEW: "bg-blue-100 text-blue-700",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await guardAdmin();
  const sp = await searchParams;
  const statusFilter = typeof sp.status === "string" ? sp.status : "all";

  const orders = await prisma.order.findMany({
    include: { package: true },
    orderBy: { createdAt: "desc" },
    take: 200,
    ...(statusFilter !== "all" ? { where: { status: statusFilter } } : {}),
  });

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Quản lý đơn hàng</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {["all", "PENDING", "PAID", "EXPIRED", "CANCELED", "REFUNDED", "NEED_REVIEW"].map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/admin/orders" : `/admin/orders?status=${s}`}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
              statusFilter === s
                ? "bg-[#ff6b6b] text-white border-[#ff6b6b]"
                : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            }`}
          >
            {s === "all" ? "Tất cả" : s}
          </Link>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Mã đơn</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Khách hàng</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Gói</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Key</th>
              <th className="p-3 text-right text-zinc-500 font-medium">Số tiền</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Trạng thái</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Thời gian</th>
              <th className="p-3 text-right text-zinc-500 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="p-3 font-mono text-xs">{o.orderCode}</td>
                <td className="p-3">{o.customerEmail}</td>
                <td className="p-3">{o.package.name}</td>
                <td className="p-3 font-mono text-xs">{o.licenseKey || "—"}</td>
                <td className="p-3 text-right">
                  {formatVND(o.amount)}
                  {o.paidAmount != null && o.paidAmount !== o.amount && (
                    <div className="text-xs text-red-500">Nhận: {formatVND(o.paidAmount)}</div>
                  )}
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[o.status] || "bg-gray-100 text-gray-700"}`}>
                    {o.status}
                  </span>
                  {o.status === "NEED_REVIEW" && o.reviewReason === "LATE_PAYMENT" && (
                    <span className="ml-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Trả tiền muộn</span>
                  )}
                  {o.status === "NEED_REVIEW" && o.reviewReason === "AMOUNT_MISMATCH" && (
                    <span className="ml-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">Lệch tiền</span>
                  )}
                  {o.paymentTransactionId && (
                    <div className="mt-1 text-[11px] text-zinc-400 font-mono" title="Mã giao dịch ngân hàng">
                      GD: {o.paymentTransactionId}
                      {o.paymentReceivedAt ? ` • ${o.paymentReceivedAt.toLocaleString("vi-VN")}` : ""}
                    </div>
                  )}
                </td>
                <td className="p-3 text-sm text-zinc-500">{o.createdAt.toLocaleString("vi-VN")}</td>
                <td className="p-3">
                  <OrderActions id={o.id} status={o.status} hasKey={Boolean(o.licenseKey)} lateReason={o.reviewReason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {orders.length === 0 && <div className="text-center py-10 text-zinc-500">Không có đơn hàng nào</div>}
    </AdminLayout>
  );
}
