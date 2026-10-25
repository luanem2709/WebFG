"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatVND } from "@/lib/payment/vietqr";

interface PackageItem {
  id: string;
  name: string;
  days: number;
  price: number;
  label: string;
  description?: string | null;
}

const DEFAULT_PACKAGES: PackageItem[] = [
  {
    id: "pkg-1-month",
    name: "Gói 1 tháng",
    days: 30,
    price: 300000,
    label: "NONE",
    description: "Sử dụng funnygame trong 30 ngày",
  },
  {
    id: "pkg-3-month",
    name: "Gói 3 tháng",
    days: 90,
    price: 750000,
    label: "SAVING",
    description: "Sử dụng funnygame trong 90 ngày, tiết kiệm 150.000đ so với mua 3 lần gói 1 tháng",
  },
];

export function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-[#ff6b6b]">🎮 funnygame</Link>
        <nav className="flex items-center gap-5 text-sm text-zinc-600 dark:text-zinc-300">
          <Link href="/#pricing" className="hover:text-[#ff6b6b]">Bảng giá</Link>
          <Link href="/guide" className="hover:text-[#ff6b6b]">Hướng dẫn</Link>
          <Link href="/account" className="hover:text-[#ff6b6b]">Tài khoản</Link>
          <Link href="/checkout" className="px-4 py-1.5 rounded-full bg-[#ff6b6b] text-white hover:bg-[#ff5252]">Mua ngay</Link>
        </nav>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-zinc-950 text-white rounded-b-3xl mb-12 shadow-xl">
      <Image
        src="/images/hero-nun.png"
        alt="funnygame"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent" />
      <div className="relative max-w-5xl mx-auto px-4 py-24 md:py-36">
        <div className="max-w-xl">
          <span className="inline-block mb-4 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-xs font-semibold uppercase tracking-wider">
            funnygame
          </span>
          <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Gói sử dụng <span className="text-[#ff6b6b]">funnygame</span>
          </h1>
          <p className="text-lg md:text-xl text-white/80 mb-8 leading-relaxed">
            Nhận key funnygame ngay sau khi thanh toán. Gói 1 tháng hoặc 3 tháng, thanh toán qua VietQR, kích hoạt tự động.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/checkout">
              <Button size="lg" className="w-full sm:w-auto">
                Mua ngay &rarr;
              </Button>
            </Link>
            <Link href="/account">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/40 bg-transparent text-white hover:bg-white/10">
                Kiểm tra tài khoản
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Pricing() {
  const [packages, setPackages] = useState<PackageItem[]>(DEFAULT_PACKAGES);

  useEffect(() => {
    fetch("/api/packages")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setPackages(data);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section id="pricing" className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Chọn gói phù hợp với bạn</h2>
          <p className="text-zinc-500 dark:text-zinc-400">
            Mỗi gói là một lần thanh toán, kích hoạt tự động ngay sau khi xác nhận chuyển khoản.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {packages.map((pkg) => {
            const isHighlighted = pkg.label === "SAVING" || pkg.label === "POPULAR";
            const badgeLabel =
              pkg.label === "SAVING"
                ? "Tiết kiệm 150.000đ"
                : pkg.label === "POPULAR"
                  ? "Phổ biến nhất"
                  : pkg.label === "NEW"
                    ? "Mới"
                    : "";
            const features = [
              `Sử dụng funnygame ${pkg.days} ngày`,
              ...(pkg.description ? [pkg.description] : []),
              "Kích hoạt tự động qua VietQR",
              "Cộng dồn thời gian khi gia hạn sớm",
              "Hỗ trợ kỹ thuật 24/7 qua email",
            ];
            return (
              <CardPricing
                key={pkg.id}
                id={pkg.id}
                name={pkg.name}
                days={`${pkg.days} ngày`}
                price={formatVND(pkg.price)}
                label={badgeLabel}
                popular={isHighlighted}
                features={features}
                cta="Mua ngay gói này"
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface CardPricingProps {
  id: string;
  name: string;
  days: string;
  price: string;
  label: string;
  popular: boolean;
  features: string[];
  cta: string;
}

function CardPricing({ id, name, days, price, label, popular, features, cta }: CardPricingProps) {
  return (
    <div
      className={`relative flex flex-col justify-between rounded-2xl border p-8 text-center transition-transform hover:-translate-y-1 ${
        popular
          ? "border-[#ff6b6b] bg-[#fff5f5] dark:bg-zinc-800/90 shadow-[0_20px_50px_rgba(255,107,107,0.15)]"
          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
      }`}
    >
      {label && (
        <Badge
          variant="warning"
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-[#ff6b6b] text-white text-xs font-bold rounded-full shadow-lg"
        >
          {label}
        </Badge>
      )}
      <div>
        <h3 className="text-2xl font-bold mb-2">{name}</h3>
        <div className="mb-6">
          <span className="text-4xl font-extrabold text-[#ff6b6b]">{price}</span>
          <span className="text-sm text-zinc-500"> / {days}</span>
        </div>
        <ul className="space-y-3 mb-8 text-sm text-zinc-600 dark:text-zinc-300 text-left">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-[#ff6b6b]"></span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <Link href={`/checkout?package=${encodeURIComponent(id)}`} className="block w-full">
        <Button variant={popular ? "primary" : "outline"} size="lg" className="w-full">
          {cta} &rarr;
        </Button>
      </Link>
    </div>
  );
}

export function Benefits() {
  const items = [
    { icon: "⚡", title: "Kích hoạt tự động", desc: "Sau khi thanh toán được xác nhận, gói được kích hoạt ngay lập tức." },
    { icon: "🔒", title: "Bảo mật cao", desc: "Thông tin giao dịch được mã hóa, không lưu thẻ tín dụng." },
    { icon: "📧", title: "Xác nhận qua email", desc: "Nhận email xác nhận đơn hàng và thông tin kích hoạt tức thì." },
    { icon: "🔄", title: "Gia hạn cộng dồn", desc: "Mua thêm khi còn hạn sẽ cộng thời gian vào ngày hết hạn hiện tại." },
    { icon: "📱", title: "Dễ dùng trên điện thoại", desc: "Giao diện tối ưu cho mobile, thanh toán nhanh qua mã VietQR." },
    { icon: "🇻🇳", title: "Hỗ trợ tiếng Việt", desc: "Giao diện và đội ngũ hỗ trợ khách hàng hoàn toàn bằng tiếng Việt." },
  ];

  return (
    <section className="py-20 px-4 bg-zinc-100 dark:bg-zinc-900">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Tại sao chọn funnygame?</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Đơn giản, nhanh chóng, minh bạch.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-4">{item.icon}</div>
              <h4 className="font-bold mb-2">{item.title}</h4>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQ() {
  const items = [
    {
      q: "Gói được kích hoạt khi nào?",
      a: "Sau khi bạn thanh toán và giao dịch được xác nhận (qua webhook ngân hàng), gói sẽ kích hoạt tự động trong vòng vài giây đến vài phút.",
    },
    {
      q: "Tôi có thể gia hạn khi còn hạn không?",
      a: "Có. Nếu bạn mua thêm khi gói còn hạn, thời gian mới sẽ được cộng dồn vào ngày hết hạn hiện tại, không mất ngày cũ.",
    },
    {
      q: "Tôi quên mã đơn, làm sao tra cứu?",
      a: "Bạn có thể tra cứu bằng email + mã đơn hàng hoặc yêu cầu liên kết đăng nhập nhanh (Magic Link) được gửi trực tiếp đến email của bạn.",
    },
    {
      q: "Hỗ trợ thanh toán gì?",
      a: "Hỗ trợ chuyển khoản ngân hàng qua mã QR VietQR (tích hợp SePay, Casso). Trong chế độ thử nghiệm (Sandbox), bạn có thể bấm nút mô phỏng thanh toán ngay trên trang.",
    },
  ];

  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Câu hỏi thường gặp</h2>
        </div>
        <div className="space-y-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="bg-white dark:bg-zinc-800 p-6 rounded-xl border border-zinc-200 dark:border-zinc-700"
            >
              <h4 className="font-bold mb-2">{item.q}</h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Contact({ email, phone }: { email: string; phone: string }) {
  return (
    <section className="py-16 px-4 mx-4 mb-12 bg-zinc-950 text-white rounded-3xl overflow-hidden relative max-w-5xl lg:mx-auto">
      <Image src="/images/hero-eye.jpg" alt="" fill sizes="100vw" className="object-cover object-center opacity-30" />
      <div className="absolute inset-0 bg-black/40"></div>
      <div className="relative max-w-3xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Cần hỗ trợ?</h2>
        <p className="mb-6 opacity-90">Liên hệ với đội ngũ funnygame qua email hoặc hotline hỗ trợ.</p>
        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center">
          <div className="flex items-center gap-2 opacity-95">
            <span>📧</span>
            <span>{email}</span>
          </div>
          <div className="flex items-center gap-2 opacity-95">
            <span>📞</span>
            <span>{phone}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-8 px-4 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-xl font-bold text-[#ff6b6b]">🎮 funnygame</div>
        <div className="flex items-center gap-6 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/checkout" className="hover:text-[#ff6b6b]">
            Mua gói
          </Link>
          <Link href="/guide" className="hover:text-[#ff6b6b]">
            Hướng dẫn
          </Link>
          <Link href="/account" className="hover:text-[#ff6b6b]">
            Tài khoản
          </Link>
          <Link href="/terms" className="hover:text-[#ff6b6b]">
            Điều khoản
          </Link>
          <Link href="/privacy" className="hover:text-[#ff6b6b]">
            Bảo mật
          </Link>
          <Link href="/refund" className="hover:text-[#ff6b6b]">
            Hoàn tiền
          </Link>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          &copy; {new Date().getFullYear()} funnygame. Bảo lưu mọi quyền.
        </p>
      </div>
    </footer>
  );
}
