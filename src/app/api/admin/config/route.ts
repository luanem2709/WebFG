import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { requireAdminSession } from "@/lib/auth";

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await prisma.config.findMany();
    const configMap: Record<string, string> = {};
    for (const row of rows) {
      if (!row.key.startsWith("magic_link:")) {
        configMap[row.key] = row.value;
      }
    }

    const packages = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });

    return NextResponse.json({
      config: configMap,
      packages,
      site: getConfig().site,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
