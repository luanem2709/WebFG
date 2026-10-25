"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/payment/vietqr";

interface CustomerData {
  email: string;
  name?: string | null;
  active: boolean;
  activatedAt?: string | null;
  expiresAt?: string | null;
  locked: boolean;
}

interface OrderItem {
  id: string;
  orderCode: string;
  amount: number;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  expiresAt?: string | null;
  licenseKey?: string | null;
  package: {
    name: string;
    days: number;
  };
}

function getCountdownParts(expiresAt: string | Date | null | undefined, nowMs: number) {
  if (!expiresAt) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  const end = new Date(expiresAt).getTime();
  const diff = end - nowMs;
  if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { expired: false, days, hours, minutes, seconds, totalMs: diff };
}

function getProgressPercent(
  activatedAt: string | Date | null | undefined,
  expiresAt: string | Date | null | undefined,
  nowMs: number
): number {
  if (!expiresAt) return 0;
  const end = new Date(expiresAt).getTime();
  const start = activatedAt ? new Date(activatedAt).getTime() : end - 30 * 24 * 60 * 60 * 1000;
  const total = end - start;
  const remaining = end - nowMs;
  if (remaining <= 0 || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((remaining / total) * 100)));
}

function statusBadge(customer: CustomerData, nowMs: number) {
  if (customer.locked) return <Badge variant="danger">Đã tạm khóa</Badge>;
  if (!customer.expiresAt) return <Badge variant="default">Chưa kích hoạt</Badge>;
  const diff = new Date(customer.expiresAt).getTime() - nowMs;
  if (diff <= 0) return <Badge variant="danger">Đã hết hạn</Badge>;
  if (diff <= 3 * 24 * 60 * 60 * 1000) return <Badge variant="warning">Sắp hết hạn (dưới 3 ngày)</Badge>;
  return <Badge variant="success">Đang hoạt động</Badge>;
}

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [orderCode, setOrderCode] = useState("");
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [devMagicUrl, setDevMagicUrl] = useState<string | null>(null);
  const [step, setStep] = useState<"lookup" | "view">("lookup");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const performLookup = useCallback(async (lookupEmail: string, lookupCode: string) => {
    setLoading(true);
    setError("");
    setInfoMessage("");
    try {
      const res = await fetch(
        `/api/orders/lookup?email=${encodeURIComponent(lookupEmail)}&code=${encodeURIComponent(lookupCode)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không tìm thấy thông tin");
      setCustomer(
        data.customer || {
          email: lookupEmail,
          active: false,
          locked: false,
        }
      );
      setOrders(data.orders || (data.order ? [data.order] : []));
      setStep("view");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Tra cứu thất bại");
    } finally {
      setLoading(false);
    }
  }, []);

  // Check URL params or active magic-link session on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlEmail = params.get("email");
    const urlCode = params.get("code");

    if (urlEmail && urlCode) {
      Promise.resolve().then(() => {
        setEmail(urlEmail);
        setOrderCode(urlCode);
        performLookup(urlEmail, urlCode);
      });
      return;
    }

    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated && data.customer) {
          setCustomer(data.customer);
          setOrders(data.orders || []);
          setEmail(data.email || data.customer.email);
          setStep("view");
        }
      })
      .catch(() => {});
  }, [performLookup]);

  // Realtime 1-second countdown ticker
  useEffect(() => {
    if (step !== "view") return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    await performLookup(email.trim(), orderCode.trim());
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfoMessage("");
    setDevMagicUrl(null);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gửi mã thất bại");
      setInfoMessage("Đã gửi liên kết truy cập đến email của bạn. Vui lòng kiểm tra hộp thư.");
      if (data.magicUrl) {
        setDevMagicUrl(data.magicUrl);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/account", { method: "POST" }).catch(() => {});
    setCustomer(null);
    setOrders([]);
    setStep("lookup");
  };

  const countdown = getCountdownParts(customer?.expiresAt, nowMs);
  const progress = getProgressPercent(customer?.activatedAt, customer?.expiresAt, nowMs);

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <nav className="mb-8 flex justify-between items-center">
        <Link href="/" className="text-sm font-medium text-[#ff6b6b] hover:underline">
          &larr; Về trang chủ
        </Link>
        <span className="flex items-center gap-4">
          <Link href="/guide" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-[#ff6b6b]">
            Hướng dẫn tải &amp; kích hoạt
          </Link>
          <Link href="/checkout" className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-[#ff6b6b]">
            Mua / Gia hạn gói &rarr;
          </Link>
        </span>
      </nav>

      {step === "lookup" ? (
        <>
          <h1 className="text-3xl font-bold mb-2">Tài khoản của tôi</h1>
          <p className="text-zinc-500 mb-8">Tra cứu thời hạn gói sử dụng funnygame của bạn</p>

          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <h3 className="font-bold text-lg">Cách 1: Email + Mã đơn hàng</h3>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLookup} className="space-y-4">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    label="Mã đơn hàng"
                    placeholder="VD: FGM2XXXX"
                    value={orderCode}
                    onChange={(e) => setOrderCode(e.target.value)}
                    required
                  />
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Đang tra cứu..." : "Tra cứu ngay"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-bold text-lg">Cách 2: Đăng nhập không mật khẩu</h3>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500 mb-4">
                  Nhận liên kết đăng nhập một lần (Magic Link) gửi thẳng vào email của bạn.
                </p>
                <form onSubmit={handleMagicLink} className="space-y-4">
                  <Input
                    label="Email của bạn"
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                    Gửi Magic Link qua Email
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">
              {error}
            </div>
          )}

          {infoMessage && (
            <div className="mt-6 p-4 rounded-xl bg-green-50 text-green-700 text-sm border border-green-200 space-y-2">
              <p>{infoMessage}</p>
              {devMagicUrl && (
                <div className="pt-2">
                  <a
                    href={devMagicUrl}
                    className="inline-block font-semibold text-[#ff6b6b] underline"
                  >
                    👉 [Dev/Sandbox] Nhấn vào đây để xác thực Magic Link ngay
                  </a>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        customer && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-400">Tài khoản khách hàng</p>
                <h1 className="text-2xl md:text-3xl font-bold">{customer.email}</h1>
              </div>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Tra cứu tài khoản khác
              </Button>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm text-zinc-500 mb-2">Trạng thái gói</h3>
                  <div>{statusBadge(customer, nowMs)}</div>
                  <p className="text-xs text-zinc-400 mt-3">
                    {customer.locked
                      ? "Vui lòng liên hệ hỗ trợ"
                      : countdown.expired
                        ? "Hãy gia hạn để tiếp tục sử dụng"
                        : "Tự động cộng dồn khi mua thêm"}
                  </p>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardContent className="p-6">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm text-zinc-500">Thời gian sử dụng còn lại (Realtime)</h3>
                    <span className="text-xs font-semibold text-[#ff6b6b]">{progress}%</span>
                  </div>

                  {countdown.expired ? (
                    <div className="text-2xl font-bold text-zinc-400 my-2">Đã hết hạn / Chưa kích hoạt</div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 my-3 text-center">
                      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-2.5">
                        <div className="text-2xl font-extrabold text-[#ff6b6b]">{countdown.days}</div>
                        <div className="text-[11px] text-zinc-500">Ngày</div>
                      </div>
                      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-2.5">
                        <div className="text-2xl font-extrabold">{String(countdown.hours).padStart(2, "0")}</div>
                        <div className="text-[11px] text-zinc-500">Giờ</div>
                      </div>
                      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-2.5">
                        <div className="text-2xl font-extrabold">{String(countdown.minutes).padStart(2, "0")}</div>
                        <div className="text-[11px] text-zinc-500">Phút</div>
                      </div>
                      <div className="bg-zinc-100 dark:bg-zinc-900 rounded-xl p-2.5">
                        <div className="text-2xl font-extrabold">{String(countdown.seconds).padStart(2, "0")}</div>
                        <div className="text-[11px] text-zinc-500">Giây</div>
                      </div>
                    </div>
                  )}

                  <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2.5 overflow-hidden mt-3">
                    <div
                      className="bg-[#ff6b6b] h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mb-8">
              <CardHeader className="flex justify-between items-center">
                <h3 className="font-bold text-lg">Chi tiết thời hạn</h3>
                <Link href="/checkout">
                  <Button size="sm">Gia hạn thêm ngày &rarr;</Button>
                </Link>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ngày kích hoạt gần nhất</span>
                    <span className="font-mono">
                      {customer.activatedAt
                        ? new Date(customer.activatedAt).toLocaleString("vi-VN")
                        : "Chưa có"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ngày hết hạn</span>
                    <span className="font-bold">
                      {customer.expiresAt
                        ? new Date(customer.expiresAt).toLocaleString("vi-VN")
                        : "Chưa có"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="font-bold text-lg">Lịch sử đơn hàng ({orders.length})</h3>
              </CardHeader>
              <CardContent className="p-0">
                {orders.length === 0 ? (
                  <div className="p-6 text-center text-sm text-zinc-500">Chưa có đơn hàng nào</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                          <th className="p-3 text-left text-zinc-500 font-medium">Mã đơn</th>
                          <th className="p-3 text-left text-zinc-500 font-medium">Gói</th>
                          <th className="p-3 text-left text-zinc-500 font-medium">Key</th>
                          <th className="p-3 text-right text-zinc-500 font-medium">Số tiền</th>
                          <th className="p-3 text-center text-zinc-500 font-medium">Trạng thái</th>
                          <th className="p-3 text-right text-zinc-500 font-medium">Thời gian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td className="p-3 font-mono text-xs font-semibold">{o.orderCode}</td>
                            <td className="p-3">{o.package?.name}</td>
                            <td className="p-3 font-mono text-xs select-all">{o.licenseKey || "—"}</td>
                            <td className="p-3 text-right">{formatVND(o.amount)}</td>
                            <td className="p-3 text-center">
                              <Badge
                                variant={
                                  o.status === "PAID"
                                    ? "success"
                                    : o.status === "PENDING"
                                      ? "warning"
                                      : "default"
                                }
                              >
                                {o.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-right text-xs text-zinc-500">
                              {new Date(o.createdAt).toLocaleString("vi-VN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  );
}
