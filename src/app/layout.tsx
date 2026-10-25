import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "vietnamese"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const TITLE = "funnygame - Gói sử dụng dịch vụ";
const DESCRIPTION =
  "Mua gói sử dụng funnygame 1 tháng hoặc 3 tháng. Thanh toán VietQR, nhận key kích hoạt tự động ngay sau khi thanh toán.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | funnygame" },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "vi_VN",
    siteName: "funnygame",
    images: [{ url: "/images/hero-nun.png", width: 1024, height: 576, alt: "funnygame" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/images/hero-nun.png"] },
};

export const viewport: Viewport = { themeColor: "#ff6b6b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 font-sans text-zinc-900 dark:bg-black dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
