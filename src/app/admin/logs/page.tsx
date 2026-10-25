import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";

import { guardAdmin } from "@/lib/admin-guard";

export default async function LogsPage() {
  await guardAdmin();
  const logs = await prisma.transactionLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Nhật ký giao dịch</h1>
        <p className="text-zinc-500">Theo dõi webhook, thanh toán và hành động admin</p>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Thời gian</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Loại</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Nguồn</th>
              <th className="p-3 text-center text-zinc-500 font-medium">Trạng thái</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Thông điệp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="p-3 font-mono text-xs">{new Date(l.createdAt).toLocaleString("vi-VN")}</td>
                <td className="p-3">{l.type}</td>
                <td className="p-3">{l.source}</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    l.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {l.status}
                  </span>
                </td>
                <td className="p-3 text-sm">{l.message || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length === 0 && (
        <div className="text-center py-10 text-zinc-500">Chưa có nhật ký nào</div>
      )}
    </AdminLayout>
  );
}
