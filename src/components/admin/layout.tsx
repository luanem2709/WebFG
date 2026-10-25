"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/admin/orders", label: "Đơn hàng", icon: "🧾" },
    { href: "/admin/customers", label: "Khách hàng", icon: "👥" },
    { href: "/admin/keys", label: "Key", icon: "🔑" },
    { href: "/admin/revoke", label: "Thu hồi key", icon: "🚫" },
    { href: "/admin/packages", label: "Gói dịch vụ", icon: "📦" },
    { href: "/admin/config", label: "Cấu hình", icon: "⚙️" },
    { href: "/admin/logs", label: "Nhật ký", icon: "📋" },
  ];

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-900">
      <aside className="w-64 bg-white dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-700 flex flex-col">
        <div className="p-6 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🎮</span>
            <span className="font-bold text-xl text-[#ff6b6b]">funnygame</span>
          </Link>
          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500">
            Admin
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                pathname === item.href
                  ? "bg-[#ff6b6b]/10 text-[#ff6b6b] border border-[#ff6b6b]/20"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800",
              ]
                .join(" ")
                .trim()}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 space-y-2">
          <Link
            href="/"
            className="block text-center text-xs text-zinc-500 hover:text-[#ff6b6b] py-1"
          >
            &larr; Xem trang bán hàng
          </Link>
          <Button variant="outline" className="w-full text-xs" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto p-8">{children}</div>
    </div>
  );
}
