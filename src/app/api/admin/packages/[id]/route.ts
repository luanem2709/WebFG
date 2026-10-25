import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { z } from "zod";

const updatePackageSchema = z.object({
  name: z.string().min(1).optional(),
  days: z.number().int().positive().optional(),
  price: z.number().int().nonnegative().optional(),
  label: z.enum(["NONE", "NEW", "POPULAR", "SAVING"]).optional(),
  active: z.boolean().optional(),
  description: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = updatePackageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const { id } = await params;
    const pkg = await prisma.package.update({
      where: { id },
      data: parsed.data,
    });

    await prisma.transactionLog.create({
      data: {
        type: "admin_update_package",
        source: "admin",
        payload: JSON.stringify({ id, updates: parsed.data }),
        status: "success",
        message: `Admin cập nhật gói: ${pkg.name}`,
      },
    });

    return NextResponse.json(pkg);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.package.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Không thể xóa gói đã có đơn hàng";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
