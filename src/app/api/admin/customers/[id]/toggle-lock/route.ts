import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/auth";
import { z } from "zod";

const lockSchema = z.object({
  locked: z.boolean(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = lockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const { id } = await params;
    const customer = await prisma.customer.update({
      where: { id },
      data: { locked: parsed.data.locked },
    });

    await prisma.transactionLog.create({
      data: {
        type: "admin_toggle_lock",
        source: "admin",
        payload: JSON.stringify({ customerId: customer.id, email: customer.email, locked: customer.locked }),
        status: "success",
        message: `Admin ${customer.locked ? "khóa" : "mở khóa"} tài khoản ${customer.email}`,
      },
    });

    return NextResponse.json({ success: true, locked: customer.locked });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
