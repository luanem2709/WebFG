import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { ConfigRow } from "@/components/admin/actions";
import { GUIDE_KEYS, getGuideSettings } from "@/lib/settings";

export default async function ConfigPage() {
  await guardAdmin();
  const configs = (await prisma.config.findMany({ orderBy: { key: "asc" } })).filter(
    (c) => !c.key.startsWith("magic_link:")
  );

  const have = new Set(configs.map((c) => c.key));
  const rows = [
    ...GUIDE_KEYS.filter((k) => !have.has(k)).map((k) => ({ key: k, value: "" })),
    ...configs,
  ];
  const g = await getGuideSettings();

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Cấu hình hệ thống</h1>
        <p className="text-zinc-500">Chỉnh sửa các thông số nghiệp vụ (orderHoldMinutes, expiryRemindDays, ...)</p>
      </div>

      {(!g.downloadConfigured || !g.guideConfigured || !g.supportConfigured) && (
        <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Bạn cần điền: {[!g.downloadConfigured && "downloadUrl (link tải)", !g.guideConfigured && "guideText (hướng dẫn kích hoạt – mỗi dòng 1 bước)", !g.supportConfigured && "supportContact (Zalo/Telegram/email hỗ trợ)"].filter(Boolean).join("; ")}. Trang /guide và email gửi khách đang dùng nội dung mặc định.
        </div>
      )}

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Khóa</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Giá trị</th>
              <th className="p-3 text-center text-zinc-500 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {rows.map((c) => (
              <ConfigRow key={c.key} k={c.key} value={c.value} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 text-sm text-zinc-500 space-y-1">
        <p>
          Các giá trị nhạy cảm (API key, SMTP password, admin password) được quản lý qua file{" "}
          <code className="font-mono">.env</code>.
        </p>
        <p>Gói dịch vụ được quản lý tại trang &quot;Gói dịch vụ&quot;.</p>
      </div>
    </AdminLayout>
  );
}
