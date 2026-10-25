import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { z } from "zod";

const createPackageSchema = z.object({
  name: z.string().min(1),
  days: z.number().int().positive(),
  price: z.number().int().nonnegative(),
  label: z.enum(["NONE", "NEW", "POPULAR", "SAVING"]).default("NONE"),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const packages = await prisma.package.findMany({ orderBy: { sortOrder: "asc" } });
    return NextResponse.json(packages);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createPackageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const pkg = await prisma.package.create({
      data: {
        name: parsed.data.name,
        days: parsed.data.days,
        price: parsed.data.price,
        label: parsed.data.label,
        description: parsed.data.description,
        sortOrder: parsed.data.sortOrder ?? 0,
        active: true,
      },
    });

    await prisma.transactionLog.create({
      data: {
        type: "admin_create_package",
        source: "admin",
        payload: JSON.stringify(pkg),
        status: "success",
        message: `Admin thêm gói mới: ${pkg.name}`,
      },
    });

    return NextResponse.json(pkg);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
