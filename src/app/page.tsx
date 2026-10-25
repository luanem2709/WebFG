import { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { Header, Hero, Pricing, Benefits, FAQ, Contact, Footer } from "@/components/landing";

export const metadata: Metadata = {
  title: "funnygame - Gói sử dụng dịch vụ",
  description: "Mua gói sử dụng funnygame 1 tháng (300.000đ) hoặc 3 tháng (750.000đ, tiết kiệm 150.000đ). Kích hoạt tự động qua VietQR.",
};

export default function Home() {
  const { site } = getConfig();
  return (
    <div className="flex flex-col flex-1">
      <Header />
      <Hero />
      <Pricing />
      <Benefits />
      <FAQ />
      <Contact email={site.contactEmail} phone={site.contactPhone} />
      <Footer />
    </div>
  );
}
