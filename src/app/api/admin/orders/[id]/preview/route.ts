import { NextResponse, NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { OrderStateError, previewReversal } from "@/lib/refund";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const action = req.nextUrl.searchParams.get("action") === "cancel" ? "cancel" : "refund";
  try {
    const { id } = await params;
    return NextResponse.json(await previewReversal(id, action));
  } catch (err: unknown) {
    if (err instanceof OrderStateError) return NextResponse.json({ error: err.message }, { status: 404 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal Server Error" }, { status: 500 });
  }
}
