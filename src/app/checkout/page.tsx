"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/payment/vietqr";

interface PackageItem {
  id: string;
  name: string;
  days: number;
  price: number;
  label: string;
  description?: string;
}

interface CreatedOrder {
  orderId: string;
  orderCode: string;
  package: PackageItem;
  amount: number;
  status: string;
  holdMinutes?: number;
  sandbox?: boolean;
  expiresAt?: string;
  licenseKey?: string | null;
  vietqr: {
    qrUrl: string;
    bankInfo: {
      bin: string;
      account: string;
      name: string;
      content: string;
    };
  };
}

export default function CheckoutPage() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [fetchingPackages, setFetchingPackages] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [holdRemainingSec, setHoldRemainingSec] = useState<number>(15 * 60);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pkgParam = params.get("package");

    fetch("/api/packages")
      .then((r) => r.json())
      .then((data: PackageItem[]) => {
        if (Array.isArray(data)) {
          setPackages(data);
          if (pkgParam && data.some((p) => p.id === pkgParam)) {
            setSelected(pkgParam);
          } else if (data.length > 0) {
            setSelected(data[0].id);
          }
        }
      })
      .catch(() => setError("Không thể tải danh sách gói dịch vụ"))
      .finally(() => setFetchingPackages(false));
  }, []);

  // Poll order status every 3 seconds while order is PENDING
  useEffect(() => {
    if (!order) return;
    const needsPolling =
      order.status === "PENDING" || (order.status === "PAID" && !order.licenseKey);
    if (!needsPolling) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${order.orderId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== order.status || (data.licenseKey && !order.licenseKey)) {
          setOrder((prev) =>
            prev ? { ...prev, status: data.status, expiresAt: data.expiresAt, licenseKey: data.licenseKey } : prev
          );
        }
      } catch {
        // Ignore transient network errors during polling
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [order]);

  // Link tải (cấu hình trong admin) cho màn hình thanh toán thành công
  useEffect(() => {
    if (order?.status !== "PAID") return;
    fetch("/api/guide")
      .then((r) => r.json())
      .then((d) => setDownloadUrl(d.downloadUrl || null))
      .catch(() => {});
  }, [order?.status]);

  // Hold time countdown
  useEffect(() => {
    if (!order || order.status !== "PENDING" || !order.expiresAt) return;
    const updateRemaining = () => {
      const diff = Math.max(0, Math.floor((new Date(order.expiresAt!).getTime() - Date.now()) / 1000));
      setHoldRemainingSec(diff);
    };
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [order]);

  if (fetchingPackages) {
    return <div className="p-10 text-center text-zinc-500">Đang tải danh sách gói dịch vụ...</div>;
  }

  const pkg = packages.find((p) => p.id === selected);
  if (!pkg) {
    return <div className="p-10 text-center text-zinc-500">Hiện chưa có gói dịch vụ nào khả dụng.</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkg) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id, customerEmail: email.trim(), customerName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tạo đơn thất bại");
      setOrder(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const handleMockPay = async () => {
    if (!order) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/webhook/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderCode: order.orderCode,
          status: "success",
          amount: order.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mock payment failed");
      setOrder((prev) =>
        prev ? { ...prev, status: "PAID", expiresAt: data.expiresAt, licenseKey: data.licenseKey } : prev
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Thanh toán mock thất bại");
    } finally {
      setLoading(false);
    }
  };

  const holdMin = Math.floor(holdRemainingSec / 60);
  const holdSec = holdRemainingSec % 60;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <nav className="mb-8 flex justify-between items-center">
        <Link href="/" className="text-sm font-medium text-[#ff6b6b] hover:underline">
          &larr; Về trang chủ
        </Link>
        <Link href="/account" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-[#ff6b6b]">
          Kiểm tra tài khoản &rarr;
        </Link>
      </nav>

      {!order ? (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex justify-between items-center">
                <h2 className="text-xl font-bold">1. Chọn gói sử dụng</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {packages.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={`w-full p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        selected === p.id
                          ? "border-[#ff6b6b] bg-[#fff5f5] dark:bg-zinc-800 shadow-sm"
                          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-[#ff6b6b]/50"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-lg">{p.name}</span>
                        {p.label && p.label !== "NONE" && (
                          <Badge variant="warning" className="text-[11px]">
                            {p.label === "SAVING" ? "Tiết kiệm 150.000đ" : p.label}
                          </Badge>
                        )}
                      </div>
                      <div className="text-2xl font-extrabold text-[#ff6b6b]">{formatVND(p.price)}</div>
                      <p className="text-sm text-zinc-500">Thời hạn: {p.days} ngày</p>
                      {p.description && <p className="text-xs text-zinc-500 mt-2">{p.description}</p>}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
                <CardHeader>
                  <h2 className="text-xl font-bold">2. Thông tin khách hàng</h2>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Email nhận gói & kích hoạt (*)"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    label="Tên hiển thị (tùy chọn)"
                    placeholder="Tên của bạn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </CardContent>
              </Card>

              <label className="flex items-start gap-2 text-xs text-zinc-500">
                <input type="checkbox" required className="mt-0.5" />
                <span>
                  Tôi đồng ý với <Link href="/terms" className="underline">Điều khoản sử dụng</Link>,{" "}
                  <Link href="/refund" className="underline">Chính sách hoàn tiền</Link> và{" "}
                  <Link href="/privacy" className="underline">Chính sách bảo mật</Link>.
                </span>
              </label>

              <Button type="submit" size="lg" className="w-full" disabled={loading || !email}>
                {loading ? "Đang tạo đơn..." : `Tạo đơn thanh toán (${formatVND(pkg.price)})`}
              </Button>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
                  {error}
                </div>
              )}
            </form>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-xl font-bold">Tóm tắt đơn hàng</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>{pkg.name}</span>
                    <span className="font-bold">{formatVND(pkg.price)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500 text-sm">
                    <span>Thời gian sử dụng</span>
                    <span>{pkg.days} ngày</span>
                  </div>
                  <div className="flex justify-between text-zinc-500 text-sm">
                    <span>Phương thức</span>
                    <span>Chuyển khoản VietQR</span>
                  </div>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-4"></div>
                  <div className="flex justify-between text-xl font-bold">
                    <span>Tổng cộng</span>
                    <span className="text-[#ff6b6b]">{formatVND(pkg.price)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-6">
              <h3 className="font-bold text-amber-800 dark:text-amber-300 mb-2">Hướng dẫn thanh toán</h3>
              <ol className="text-sm text-amber-700 dark:text-amber-400 space-y-2 list-decimal list-inside">
                <li>Chọn gói và nhập địa chỉ email của bạn</li>
                <li>Nhấn &ldquo;Tạo đơn thanh toán&rdquo; để nhận mã QR</li>
                <li>Quét mã VietQR bằng ứng dụng ngân hàng</li>
                <li>Giữ nguyên nội dung chuyển khoản là mã đơn hàng</li>
                <li>Hệ thống tự động xác nhận và kích hoạt gói ngay lập tức</li>
              </ol>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-xl mx-auto">
          <div className="mb-6 text-center">
            <Badge variant={order.status === "PAID" ? "success" : "warning"} className="mb-2">
              {order.status === "PAID" ? "ĐÃ THANH TOÁN" : "ĐANG CHỜ THANH TOÁN"}
            </Badge>
            <h1 className="text-3xl font-bold">Đơn hàng #{order.orderCode}</h1>
            <p className="text-zinc-500 mt-1">
              {order.package.name} ({order.package.days} ngày) &bull; {formatVND(order.amount)}
            </p>
          </div>

          <Card className="p-8">
            <div className="flex flex-col items-center justify-center text-center">
              {order.status === "PENDING" && (
                <>
                  <h2 className="text-xl font-bold mb-2">Quét mã VietQR để thanh toán</h2>
                  <p className="text-zinc-500 mb-4">
                    Số tiền cần chuyển:{" "}
                    <span className="font-bold text-[#ff6b6b] text-lg">{formatVND(order.amount)}</span>
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://img.vietqr.io/image/${order.vietqr.bankInfo.bin}-${order.vietqr.bankInfo.account}-compact.png?amount=${order.amount}&addInfo=${encodeURIComponent(order.orderCode)}&accountName=${encodeURIComponent(order.vietqr.bankInfo.name)}`}
                    alt="VietQR"
                    className="w-64 h-64 rounded-xl mb-6 border border-zinc-200 p-2 bg-white"
                  />
                  <div className="w-full bg-zinc-100 dark:bg-zinc-900 p-4 rounded-xl mb-6 text-sm space-y-2 text-left">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Chủ tài khoản:</span>
                      <span className="font-semibold">{order.vietqr.bankInfo.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Số tài khoản:</span>
                      <span className="font-mono font-semibold">{order.vietqr.bankInfo.account}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Nội dung CK:</span>
                      <span className="font-mono font-bold text-[#ff6b6b]">{order.orderCode}</span>
                    </div>
                  </div>

                  <div className="w-full mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-800 dark:text-amber-300 text-sm">
                    ⏳ Trang đang tự động kiểm tra giao dịch (mỗi 3 giây). Đơn hàng giữ chỗ trong{" "}
                    <span className="font-mono font-bold">
                      {String(holdMin).padStart(2, "0")}:{String(holdSec).padStart(2, "0")}
                    </span>
                    .
                  </div>

                  {order.sandbox && (
                    <Button
                      onClick={handleMockPay}
                      disabled={loading}
                      variant="secondary"
                      className="w-full"
                    >
                      {loading ? "Đang xử lý..." : "⚡ Mô phỏng thanh toán thành công (Sandbox)"}
                    </Button>
                  )}
                </>
              )}

              {order.status === "PAID" && (
                <div className="py-6 space-y-6 w-full">
                  <div className="w-16 h-16 mx-auto rounded-full bg-green-100 text-green-600 flex items-center justify-center text-3xl font-bold">
                    ✓
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-green-600 mb-2">
                      Thanh toán & Kích hoạt thành công!
                    </h2>
                    <p className="text-sm text-zinc-500">
                      Gói <strong>{order.package.name}</strong> đã được kích hoạt cho tài khoản{" "}
                      <strong>{email}</strong>. Email xác nhận cũng đã được gửi.
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-900 text-center">
                    <div className="text-xs text-zinc-500 mb-1">Key kích hoạt của bạn</div>
                    {order.licenseKey ? (
                      <div className="space-y-2">
                        <div className="font-mono text-xl font-bold text-[#ff6b6b] break-all select-all">{order.licenseKey}</div>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(order.licenseKey!)}
                          className="text-xs text-zinc-500 hover:text-[#ff6b6b] underline cursor-pointer"
                        >
                          Sao chép key
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-500">Đang tạo key, vui lòng đợi giây lát...</div>
                    )}
                  </div>
                  {order.expiresAt && (
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 text-sm">
                      Hết hạn vào:{" "}
                      <strong className="text-green-700 dark:text-green-300">
                        {new Date(order.expiresAt).toLocaleString("vi-VN")}
                      </strong>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2">
                    {downloadUrl && (
                      <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-6 py-3 rounded-full bg-green-600 text-white font-medium hover:bg-green-700">
                        Tải phần mềm
                      </a>
                    )}
                    <Link href="/guide" className="flex-1 text-center px-6 py-3 rounded-full border border-zinc-300 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800">
                      Hướng dẫn kích hoạt
                    </Link>
                  </div>
                  <Link
                    href={`/account?email=${encodeURIComponent(email)}&code=${encodeURIComponent(order.orderCode)}`}
                    className="block w-full"
                  >
                    <Button className="w-full" size="lg">
                      Xem trang tài khoản & Đếm ngược &rarr;
                    </Button>
                  </Link>
                </div>
              )}

              {error && (
                <div className="mt-4 w-full p-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
                  {error}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
