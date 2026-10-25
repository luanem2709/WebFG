import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { formatVND } from "@/lib/payment/vietqr";
import { getConfig } from "@/lib/config";

export default async function DashboardPage() {
  await guardAdmin();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const remindDays = getConfig().business.expiryRemindDays;
  const soon = new Date(now.getTime() + remindDays * 24 * 60 * 60 * 1000);

  const [revenueToday, revenueMonth, activeCustomers, pendingOrders, needReview, expiring] =
    await Promise.all([
      prisma.order.aggregate({
        where: { status: "PAID", paidAt: { gte: todayStart } },
        _sum: { paidAmount: true },
      }),
      prisma.order.aggregate({
        where: { status: "PAID", paidAt: { gte: monthStart } },
        _sum: { paidAmount: true },
      }),
      prisma.customer.count({ where: { active: true, locked: false, expiresAt: { gt: now } } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "NEED_REVIEW" } }),
      prisma.customer.findMany({
        where: { active: true, expiresAt: { gt: now, lte: soon } },
        orderBy: { expiresAt: "asc" },
        take: 10,
      }),
    ]);

  const stats = [
    { icon: "💰", value: formatVND(revenueToday._sum.paidAmount || 0), label: "Doanh thu hôm nay" },
    { icon: "📈", value: formatVND(revenueMonth._sum.paidAmount || 0), label: "Doanh thu tháng" },
    { icon: "👥", value: activeCustomers, label: "Khách đang hoạt động" },
    { icon: "⏳", value: pendingOrders, label: "Đơn chờ thanh toán" },
    { icon: "⚠️", value: needReview, label: "Đơn cần duyệt tay" },
  ];

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-zinc-500">Tổng quan hoạt động funnygame</p>
      </div>

      <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
            <span className="text-2xl">{s.icon}</span>
            <div className="text-xl font-bold mt-2">{s.value}</div>
            <p className="text-xs text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
        <h2 className="font-bold mb-4">Khách sắp hết hạn (trong {remindDays} ngày)</h2>
        {expiring.length === 0 ? (
          <p className="text-sm text-zinc-500">Không có khách nào sắp hết hạn.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-700 text-sm">
            {expiring.map((c) => (
              <li key={c.id} className="py-2 flex justify-between">
                <span>{c.email}</span>
                <span className="text-zinc-500">{c.expiresAt!.toLocaleString("vi-VN")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
