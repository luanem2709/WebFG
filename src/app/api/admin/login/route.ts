import { NextResponse } from "next/server";
import { authenticateAdmin, setSessionCookie, ADMIN_SESSION_COOKIE } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({
  username: z.string(),
  password: z.string(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!rateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000).allowed) {
    return NextResponse.json({ error: "Thử quá nhiều lần, vui lòng đợi 15 phút" }, { status: 429 });
  }
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const ok = await authenticateAdmin(parsed.data.username, parsed.data.password);
    if (!ok) {
      return NextResponse.json({ error: "Sai tên đăng nhập hoặc mật khẩu" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });
    setSessionCookie(response.headers, ADMIN_SESSION_COOKIE, parsed.data.username, 24 * 60 * 60);
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
