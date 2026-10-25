import { getConfig } from "@/lib/config";

export function generateVietQR(
  orderCode: string,
  amount: number,
  addInfo?: string
): { qrUrl: string; qrData: string; bankInfo: { bin: string; account: string; name: string; content: string } } {
  const config = getConfig();
  const bin = config.payment.vietqrBin;
  const account = config.payment.vietqrAccount;
  const name = config.payment.vietqrAccountName;
  const content = addInfo || orderCode;
  const template = config.payment.vietqrTemplate;

  const qrData = `https://img.vietqr.io/image/${bin}-${account}-${template}.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(name)}&message=${encodeURIComponent(orderCode)}`;

  return {
    qrUrl: qrData,
    qrData,
    bankInfo: {
      bin,
      account,
      name,
      content,
    },
  };
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
