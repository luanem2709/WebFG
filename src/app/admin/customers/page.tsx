import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { CustomerActions } from "@/components/admin/actions";

export default async function CustomersPage() {
  await guardAdmin();
  const customers = await prisma.customer.findMany({ orderBy: { updatedAt: "desc" } });
  const now = new Date();

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Quản lý khách hàng</h1>
        <p className="text-zinc-500">Xem và điều chỉnh thời gian gói sử dụng</p>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Email</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Hết hạn</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Còn lại</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Trạng thái</th>
              <th className="p-3 text-center text-zinc-500 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {customers.map((c) => {
              const diff = c.expiresAt ? c.expiresAt.getTime() - now.getTime() : -1;
              const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
              return (
                <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="p-3">{c.email}</td>
                  <td className="p-3">{c.expiresAt ? c.expiresAt.toLocaleString("vi-VN") : "—"}</td>
                  <td className="p-3 font-mono text-xs">{diff > 0 ? `${daysLeft} ngày` : "Đã hết hạn"}</td>
                  <td className="p-3">
                    {c.locked ? (
                      <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs">Đã khóa</span>
                    ) : diff > 0 ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs">Hoạt động</span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs">Không hoạt động</span>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <CustomerActions id={c.id} locked={c.locked} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {customers.length === 0 && <div className="text-center py-10 text-zinc-500">Không có khách hàng nào</div>}
    </AdminLayout>
  );
}
