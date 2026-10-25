import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdapter } from "@/lib/payment/adapter";
import { getConfig } from "@/lib/config";
import { generateVietQR } from "@/lib/payment/vietqr";
import { rateLimit } from "@/lib/rate-limit";
import { getOrCreateCustomer } from "@/lib/auth";
import { z } from "zod";

const createOrderSchema = z.object({
  packageId: z.string(),
  customerEmail: z.string().email(),
  customerName: z.string().optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const limit = rateLimit(`order:${ip}`, 10, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const { packageId, customerEmail, customerName } = parsed.data;

    const pkg = await prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg || !pkg.active) {
      return NextResponse.json({ error: "Gói không tồn tại hoặc không hoạt động" }, { status: 404 });
    }

    const customer = await getOrCreateCustomer(customerEmail);
    if (customer.locked) {
      return NextResponse.json({ error: "Tài khoản này đang bị tạm khóa" }, { status: 403 });
    }

    const orderCode =
      "FG" +
      Date.now().toString(36).toUpperCase() +
      Math.random().toString(36).slice(2, 6).toUpperCase();

    const config = getConfig();
    const adapter = createAdapter(
      config.payment.gateway,
      config.payment.sepayApiKey,
      config.payment.sepaySecret,
      config.payment.sepayMerchantId,
      config.payment.cassoApiKey,
      config.payment.cassoSecret,
      config.payment.cassoMerchantId
    );

    const payment = await adapter.createPayment(
      orderCode,
      pkg.price,
      `${config.site.siteName} - ${pkg.name}`
    );

    const order = await prisma.order.create({
      data: {
        orderCode,
        packageId: pkg.id,
        customerEmail,
        customerName: customerName || customer.name,
        amount: pkg.price,
        status: "PENDING",
        webhookPayload: JSON.stringify(payment.raw),
      },
      include: { package: true },
    });

    await prisma.transactionLog.create({
      data: {
        type: "order_created",
        source: config.payment.gateway,
        payload: JSON.stringify({
          orderId: order.id,
          orderCode,
          packageId: pkg.id,
          amount: pkg.price,
        }),
        status: "success",
        message: `Tạo đơn hàng ${orderCode} (${pkg.name}) cho ${customerEmail}`,
      },
    });

    const vietqr = generateVietQR(orderCode, pkg.price, orderCode);

    return NextResponse.json({
      orderId: order.id,
      orderCode,
      package: pkg,
      amount: pkg.price,
      status: "PENDING",
      vietqr,
      payment,
      sandbox: config.payment.sandbox && config.payment.gateway === "mock",
      holdMinutes: config.business.orderHoldMinutes,
      expiresAt: new Date(Date.now() + config.business.orderHoldMinutes * 60 * 1000),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
