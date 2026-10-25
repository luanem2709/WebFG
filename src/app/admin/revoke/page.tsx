import { prisma } from "@/lib/prisma";
import AdminLayout from "@/components/admin/layout";
import { guardAdmin } from "@/lib/admin-guard";
import { getConfig } from "@/lib/config";
import { isSheetConfigured } from "@/lib/google-sheets";
import { inspectKeys, type RevocationInfo } from "@/lib/license-sheet";
import { AckRevokeButton, CopyButton } from "@/components/admin/actions";

export default async function RevokePage() {
  await guardAdmin();
  const cfg = getConfig().licenseSheet;
  const now = new Date();

  if (cfg.revokeMode === "OFF") {
    return (
      <AdminLayout>
        <h1 className="text-3xl font-bold mb-2">Key cần thu hồi</h1>
        <p className="text-zinc-500">Tính năng đang TẮT (REVOKE_MODE=OFF).</p>
      </AdminLayout>
    );
  }

  const keyed = await prisma.order.findMany({
    where: { licenseKey: { not: null }, revokeAckAt: null, status: { in: ["REFUNDED", "CANCELED", "PAID"] } },
    include: { package: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const customers = await prisma.customer.findMany({ where: { email: { in: [...new Set(keyed.map((o) => o.customerEmail))] } } });
  const byEmail = new Map(customers.map((c) => [c.email, c]));

  const items = keyed
    .map((o) => {
      const c = byEmail.get(o.customerEmail);
      let reason = "";
      if (o.status === "REFUNDED") reason = "Đơn hoàn tiền";
      else if (o.status === "CANCELED") reason = "Đơn bị hủy";
      else if (c?.locked) reason = "Khách bị khóa";
      else if (c?.expiresAt && c.expiresAt <= now) reason = "Gói hết hạn";
      return { order: o, reason };
    })
    .filter((i) => i.reason);

  let info: RevocationInfo | null = null;
  let error = "";
  if (isSheetConfigured() && items.length > 0) {
    try {
      info = await inspectKeys(items.map((i) => i.order.licenseKey!));
    } catch (e) {
      error = e instanceof Error ? e.message : "Không đọc được sheet";
    }
  }

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Key cần thu hồi</h1>
        <p className="text-zinc-500">
          Web <strong>không tự sửa</strong> Google Sheet. Hãy thu hồi thủ công hoặc theo quy trình của ứng dụng đọc sheet, rồi bấm &quot;Đã xử lý&quot;.
        </p>
      </div>

      <div className="mb-6 p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm space-y-1">
        <p>
          Cột Status: <strong>{info?.statusColumn ?? "—"}</strong> • Cột hạn: <strong>{info?.expiresColumn ?? "—"}</strong>
        </p>
        <p>Giá trị Status đang có trong sheet: {info?.statusValues.length ? info.statusValues.join(", ") : "(chưa đọc được)"}</p>
        <p className="text-xs text-zinc-500">
          Chế độ thu hồi: {cfg.revokeMode}. Cần xác nhận với người làm ứng dụng: app có tự kiểm tra ExpiresAt/Days không, có giá trị Status nào đánh dấu thu hồi không (xem README mục &quot;Thu hồi key&quot;).
        </p>
      </div>

      {error && <div className="mb-6 p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
      {!isSheetConfigured() && (
        <div className="mb-6 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">Chưa cấu hình Google Sheet nên không có số dòng.</div>
      )}

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
              <th className="p-3 text-left text-zinc-500 font-medium">Lý do</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Đơn / Khách</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Key</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Dòng sheet</th>
              <th className="p-3 text-left text-zinc-500 font-medium">Status / Hạn trên sheet</th>
              <th className="p-3 text-right text-zinc-500 font-medium">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {items.map(({ order, reason }) => {
              const found = info?.byKey[order.licenseKey!.toUpperCase()];
              return (
                <tr key={order.id}>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">{reason}</span>
                  </td>
                  <td className="p-3">
                    <div className="font-mono text-xs">{order.orderCode}</div>
                    <div className="text-xs text-zinc-500">{order.customerEmail}</div>
                  </td>
                  <td className="p-3 font-mono text-xs select-all">{order.licenseKey}</td>
                  <td className="p-3">{found ? found.row : info ? <span className="text-amber-600">Không thấy trên sheet</span> : "—"}</td>
                  <td className="p-3 text-xs text-zinc-500">{found ? `${found.status || "—"} / ${found.expiresAt || "—"}` : "—"}</td>
                  <td className="p-3 text-right space-x-3 whitespace-nowrap">
                    <CopyButton text={order.licenseKey!} label="Chép key" />
                    {found && <CopyButton text={`${order.licenseKey} (dòng ${found.row})`} label="Chép key+dòng" />}
                    <AckRevokeButton orderId={order.id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {items.length === 0 && <div className="text-center py-10 text-zinc-500">Không có key nào cần thu hồi</div>}
    </AdminLayout>
  );
}
