import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { formatVND } from "@/lib/payment/vietqr";
import { PackageForm, PackageToggle } from "@/components/admin/actions";

export default async function PackagesPage() {
  await guardAdmin();
  const packages = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Quản lý gói dịch vụ</h1>
      </div>

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Tên gói</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Thời gian</th>
              <th className="p-3 text-right text-zinc-500 font-medium">Giá</th>
              <th className="p-3 text-center text-zinc-500 font-medium">Nhãn</th>
              <th className="p-3 text-center text-zinc-500 font-medium">Hoạt động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {packages.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="p-3">{p.name}</td>
                <td className="p-3">{p.days} ngày</td>
                <td className="p-3 text-right">{formatVND(p.price)}</td>
                <td className="p-3 text-center">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.label === "POPULAR"
                        ? "bg-amber-100 text-amber-700"
                        : p.label === "SAVING"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {p.label || "—"}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <PackageToggle id={p.id} active={p.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
        <h3 className="font-bold mb-4">Thêm gói mới</h3>
        <PackageForm />
      </div>
    </AdminLayout>
  );
}
