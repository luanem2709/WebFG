import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import * as bcrypt from "bcryptjs";

export async function seed() {
  const existing = await prisma.package.count();
  if (existing > 0) {
    console.log("Seed already applied, skipping.");
    return;
  }

  const packages = await prisma.package.createMany({
    data: getConfig().packages.map((p) => ({
      id: p.id,
      name: p.name,
      days: p.days,
      price: p.price,
      active: p.active,
      label: p.label,
      sortOrder: p.sortOrder ?? 0,
      description: p.description,
    })),
  });
  console.log(`Created ${packages.count} packages.`);

  const passwordHash = await bcrypt.hash(getConfig().admin.password, 10);
  await prisma.admin.create({
    data: {
      username: getConfig().admin.username,
      password: passwordHash,
    },
  });
  console.log(`Created admin user: ${getConfig().admin.username}`);

  await prisma.config.createMany({
    data: [
      { key: "siteName", value: getConfig().site.siteName },
      { key: "siteTitle", value: getConfig().site.siteTitle },
      { key: "primaryColor", value: getConfig().site.primaryColor },
      { key: "contactEmail", value: getConfig().site.contactEmail },
      { key: "contactPhone", value: getConfig().site.contactPhone },
      { key: "contactAddress", value: getConfig().site.contactAddress },
      { key: "paymentGateway", value: getConfig().payment.gateway },
      { key: "expiryRemindDays", value: String(getConfig().business.expiryRemindDays) },
      { key: "orderHoldMinutes", value: String(getConfig().business.orderHoldMinutes) },
      { key: "sandbox", value: String(getConfig().payment.sandbox) },
    ],
  });
  console.log("Created default config entries.");

  console.log("Seed complete.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
