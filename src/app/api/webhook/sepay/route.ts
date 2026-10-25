import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAdapter } from "@/lib/payment/adapter";
import { getConfig } from "@/lib/config";
import { processPaymentWebhook, recordWebhookAuthFailure } from "@/lib/fulfillment";

export async function POST(req: Request) {
  try {
    const config = getConfig();
    const adapter = createAdapter(
      "sepay",
      config.payment.sepayApiKey,
      config.payment.sepaySecret,
      config.payment.sepayMerchantId,
      config.payment.cassoApiKey,
      config.payment.cassoSecret,
      config.payment.cassoMerchantId
    );

    const body = await req.json();
    const result = await adapter.verify(body, req.headers.get("authorization") || undefined);

    if (result.authFailed) {
      await recordWebhookAuthFailure("sepay");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (result.ignored) {
      return NextResponse.json({ status: "ignored" });
    }
    if (!result.success || !result.transactionId) {
      await prisma.transactionLog.create({
        data: {
          type: "webhook_failed",
          source: "sepay",
          payload: JSON.stringify(body),
          status: "failed",
          message: result.error || "Invalid payment",
        },
      });
      return NextResponse.json({ error: "Invalid payment" }, { status: 400 });
    }

    const out = await processPaymentWebhook({
      gateway: "sepay",
      transactionId: result.transactionId,
      orderCode: result.orderCode,
      paidAmount: result.paidAmount,
      payload: body,
    });
    return NextResponse.json(out.body, { status: out.httpStatus });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    await prisma.transactionLog.create({
      data: { type: "webhook_error", source: "sepay", payload: null, status: "failed", message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
