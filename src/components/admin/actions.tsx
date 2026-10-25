"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.error || "Có lỗi xảy ra";
}

interface Preview {
  orderCode: string;
  customerEmail: string;
  status: string;
  allowed: boolean;
  reason?: string;
  days: number;
  currentExpiresAt: string | null;
  newExpiresAt: string | null;
  expiresNow: boolean;
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString("vi-VN") : "—");

function ReversalDialog({
  id,
  action,
  onClose,
}: {
  id: string;
  action: "refund" | "cancel";
  onClose: () => void;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [keepDays, setKeepDays] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = action === "refund" ? "Hoàn tiền" : "Hủy đơn";

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/orders/${id}/preview?action=${action}`)
      .then((r) => r.json())
      .then((d) => alive && (d.error ? setError(d.error) : setPreview(d)))
      .catch(() => alive && setError("Không tải được thông tin đơn"));
    return () => {
      alive = false;
    };
  }, [id, action]);

  const submit = async () => {
    setBusy(true);
    const err = await call(`/api/admin/orders/${id}/action`, "POST", { action, deductDays: !keepDays });
    setBusy(false);
    if (err) return setError(err);
    onClose();
    router.refresh();
  };

  const deducting = preview && preview.days > 0 && !keepDays;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-800 p-6 shadow-xl space-y-4 text-left">
        <h3 className="text-lg font-bold">{label}</h3>
        {!preview && !error && <p className="text-sm text-zinc-500">Đang tải...</p>}
        {preview && (
          <div className="space-y-3 text-sm">
            <p>
              Đơn <span className="font-mono">{preview.orderCode}</span> • {preview.customerEmail}
            </p>
            {!preview.allowed ? (
              <p className="text-red-600">{preview.reason}</p>
            ) : preview.days > 0 ? (
              <>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-amber-800">
                  {deducting ? (
                    <>
                      Sẽ <strong>trừ {preview.days} ngày</strong> khỏi hạn của khách.
                      <br />
                      Hạn hiện tại: {fmtDate(preview.currentExpiresAt)}
                      <br />
                      Hạn mới: <strong>{fmtDate(preview.newExpiresAt)}</strong>
                      {preview.expiresNow && " (hết hạn ngay)"}
                    </>
                  ) : (
                    <>Hạn của khách <strong>giữ nguyên</strong>: {fmtDate(preview.currentExpiresAt)}</>
                  )}
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={keepDays} onChange={(e) => setKeepDays(e.target.checked)} />
                  Không trừ hạn (trường hợp đặc biệt)
                </label>
                <p className="text-xs text-zinc-500">
                  Key trên Google Sheet không bị sửa tự động — xem trang &quot;Thu hồi key&quot; để xử lý.
                </p>
              </>
            ) : (
              <p className="text-zinc-600">Đơn chưa từng được kích hoạt nên không có hạn để trừ.</p>
            )}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-full border border-zinc-300 cursor-pointer">
            Đóng
          </button>
          <button
            onClick={submit}
            disabled={busy || !preview?.allowed}
            className="px-4 py-2 text-sm rounded-full bg-red-600 text-white disabled:opacity-40 cursor-pointer"
          >
            {busy ? "Đang xử lý..." : `Xác nhận ${label.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderActions({
  id,
  status,
  hasKey,
  lateReason,
}: {
  id: string;
  status: string;
  hasKey: boolean;
  lateReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"refund" | "cancel" | null>(null);

  const run = async (action: string, question: string) => {
    if (!confirm(question)) return;
    setBusy(true);
    const err = await call(`/api/admin/orders/${id}/action`, "POST", { action });
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  const btn = "text-xs hover:underline cursor-pointer disabled:opacity-40";
  const activatable = status === "PENDING" || status === "NEED_REVIEW" || status === "EXPIRED";
  return (
    <div className="flex gap-2 justify-end flex-wrap">
      {activatable && (
        <button
          disabled={busy}
          onClick={() =>
            run(
              "confirm",
              status === "NEED_REVIEW"
                ? "Kích hoạt đơn này (chạy luồng kích hoạt bình thường: cộng hạn, tạo key, gửi email)?"
                : "Xác nhận thanh toán và kích hoạt đơn này?"
            )
          }
          className={`${btn} text-green-600`}
        >
          {status === "NEED_REVIEW" ? "Kích hoạt" : "Xác nhận"}
        </button>
      )}
      {status === "NEED_REVIEW" && (
        <button disabled={busy} onClick={() => setDialog("refund")} className={`${btn} text-amber-600`}>
          Hoàn tiền
        </button>
      )}
      {status === "NEED_REVIEW" && lateReason !== "LATE_PAYMENT" && (
        <button disabled={busy} onClick={() => setDialog("cancel")} className={`${btn} text-red-600`}>
          Hủy
        </button>
      )}
      {status === "PENDING" && (
        <button disabled={busy} onClick={() => setDialog("cancel")} className={`${btn} text-red-600`}>
          Hủy
        </button>
      )}
      {status === "PAID" && !hasKey && (
        <button disabled={busy} onClick={() => run("issue_key", "Cấp key cho đơn này?")} className={`${btn} text-blue-600`}>
          Cấp key
        </button>
      )}
      {status === "PAID" && (
        <>
          <button disabled={busy} onClick={() => setDialog("refund")} className={`${btn} text-amber-600`}>
            Hoàn tiền
          </button>
          <button disabled={busy} onClick={() => setDialog("cancel")} className={`${btn} text-red-600`}>
            Hủy
          </button>
        </>
      )}
      {dialog && <ReversalDialog id={id} action={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

export function CopyButton({ text, label = "Sao chép" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="text-xs text-blue-600 hover:underline cursor-pointer"
    >
      {done ? "Đã chép" : label}
    </button>
  );
}

export function AckRevokeButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (!confirm("Xác nhận bạn ĐÃ thu hồi/vô hiệu key này theo quy trình của ứng dụng đọc sheet?")) return;
        setBusy(true);
        const err = await call("/api/admin/revoke/ack", "POST", { orderId });
        setBusy(false);
        if (err) alert(err);
        router.refresh();
      }}
      className="text-xs text-green-600 hover:underline cursor-pointer disabled:opacity-40"
    >
      Đã xử lý
    </button>
  );
}

export function CustomerActions({ id, locked }: { id: string; locked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const adjust = async () => {
    const input = prompt("Nhập số ngày cộng thêm (số âm để trừ):", "30");
    if (input === null) return;
    const days = Number(input);
    if (!Number.isFinite(days) || days === 0) return alert("Số ngày không hợp lệ");
    setBusy(true);
    const err = await call(`/api/admin/customers/${id}/adjust-days`, "POST", { days });
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  const toggle = async () => {
    setBusy(true);
    const err = await call(`/api/admin/customers/${id}/toggle-lock`, "POST", { locked: !locked });
    setBusy(false);
    if (err) alert(err);
    router.refresh();
  };

  return (
    <>
      <button disabled={busy} onClick={adjust} className="text-xs text-[#ff6b6b] hover:underline">
        Chỉnh ngày
      </button>
      <button
        disabled={busy}
        onClick={toggle}
        className={`ml-2 text-xs hover:underline ${locked ? "text-green-600" : "text-red-600"}`}
      >
        {locked ? "Mở khóa" : "Khóa"}
      </button>
    </>
  );
}

export function PackageToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const err = await call(`/api/admin/packages/${id}`, "PUT", { active: !active });
        setBusy(false);
        if (err) alert(err);
        router.refresh();
      }}
      className={`px-2 py-1 rounded-full text-xs font-medium cursor-pointer ${
        active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
      }`}
    >
      {active ? "Bật" : "Tắt"}
    </button>
  );
}

export function PackageForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setError("");
    const err = await call("/api/admin/packages", "POST", {
      name: String(fd.get("name") || ""),
      days: Number(fd.get("days")),
      price: Number(fd.get("price")),
      label: String(fd.get("label") || "NONE"),
    });
    setBusy(false);
    if (err) return setError(err);
    form.reset();
    router.refresh();
  };

  return (
    <form className="space-y-4 max-w-md" onSubmit={submit}>
      <input name="name" required placeholder="Tên gói" className="p-2 border rounded w-full dark:bg-zinc-900" />
      <input name="days" type="number" min={1} required placeholder="Số ngày" className="p-2 border rounded w-full dark:bg-zinc-900" />
      <input name="price" type="number" min={0} required placeholder="Giá (VNĐ)" className="p-2 border rounded w-full dark:bg-zinc-900" />
      <select name="label" className="p-2 border rounded w-full dark:bg-zinc-900">
        <option>NONE</option>
        <option>NEW</option>
        <option>POPULAR</option>
        <option>SAVING</option>
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Đang thêm..." : "Thêm gói"}
      </Button>
    </form>
  );
}

export function ConfigRow({ k, value }: { k: string; value: string }) {
  const router = useRouter();
  const [val, setVal] = useState(value);
  const [busy, setBusy] = useState(false);
  const dirty = val !== value;

  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
      <td className="p-3 font-mono text-xs">{k}</td>
      <td className="p-3">
        {k === "guideText" ? (
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            rows={6}
            placeholder="Mỗi dòng là một bước hướng dẫn"
            className="p-2 border rounded w-full dark:bg-zinc-900"
          />
        ) : (
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={k === "downloadUrl" ? "https://... (link tải phần mềm)" : k === "supportContact" ? "Zalo/Telegram/email hỗ trợ" : ""}
            className="p-2 border rounded w-full dark:bg-zinc-900"
          />
        )}
      </td>
      <td className="p-3 text-center">
        <button
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            const err = await call(`/api/admin/config/${encodeURIComponent(k)}`, "PUT", { value: val });
            setBusy(false);
            if (err) alert(err);
            router.refresh();
          }}
          className="text-xs text-[#ff6b6b] hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Lưu
        </button>
      </td>
    </tr>
  );
}
