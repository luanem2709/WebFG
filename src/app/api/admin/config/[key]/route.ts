import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { z } from "zod";

const updateSchema = z.object({
  value: z.string(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const { key } = await params;
    await prisma.config.upsert({
      where: { key },
      update: { value: parsed.data.value },
      create: { key, value: parsed.data.value },
    });

    await prisma.transactionLog.create({
      data: {
        type: "admin_update_config",
        source: "admin",
        payload: JSON.stringify({ key, value: parsed.data.value }),
        status: "success",
        message: `Admin cập nhật cấu hình ${key} = ${parsed.data.value}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
