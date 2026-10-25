import { NextResponse } from "next/server";
import { requestMagicLink } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limit = rateLimit(`magic:${ip}`, 5, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Email không hợp lệ" }, { status: 400 });
    }

    const result = await requestMagicLink(parsed.data.email);
    return NextResponse.json({
      success: true,
      message: "Đã gửi mã truy cập đến email của bạn",
      magicUrl: result.magicUrl,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
