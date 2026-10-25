import * as bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { sendMagicLink } from "@/lib/email";

const ADMIN_SESSION_COOKIE = "fg_admin_session";
const CUSTOMER_SESSION_COOKIE = "fg_customer_session";

export { ADMIN_SESSION_COOKIE, CUSTOMER_SESSION_COOKIE };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function authenticateAdmin(username: string, password: string): Promise<boolean> {
  const config = getConfig();
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (admin) {
    return verifyPassword(password, admin.password);
  }
  return username === config.admin.username && password === config.admin.password;
}

export function makeSessionToken(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function sign(payload: string): string {
  return createHmac("sha256", getConfig().admin.sessionSecret).update(payload).digest("base64url");
}

/** Token dạng base64url(value).expiresAtMs.signature — chống giả mạo cookie. */
export function signSessionValue(value: string, maxAgeSec: number): string {
  const payload = `${Buffer.from(value, "utf8").toString("base64url")}.${Date.now() + maxAgeSec * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(parts[1]) < Date.now()) return null;
  return Buffer.from(parts[0], "base64url").toString("utf8");
}

export function setSessionCookie(
  resHeaders: Headers,
  name: string,
  value: string,
  maxAge: number
) {
  resHeaders.set(
    "Set-Cookie",
    `${name}=${encodeURIComponent(signSessionValue(value, maxAge))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

export function clearSessionCookie(resHeaders: Headers, name: string) {
  resHeaders.set("Set-Cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function getCookie(reqHeaders: Headers, name: string): string | undefined {
  const cookie = reqHeaders.get("cookie");
  if (!cookie) return undefined;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function requireAdminSession(): Promise<string | null> {
  const h = await headers();
  const username = verifySessionValue(getCookie(h, ADMIN_SESSION_COOKIE));
  if (!username) return null;
  if (username === getConfig().admin.username) return username;
  const admin = await prisma.admin.findUnique({ where: { username } });
  return admin ? admin.username : null;
}

export async function getCustomerSession(): Promise<string | null> {
  const h = await headers();
  return verifySessionValue(getCookie(h, CUSTOMER_SESSION_COOKIE));
}

export async function requestMagicLink(email: string): Promise<{
  success: boolean;
  magicUrl?: string;
  error?: string;
}> {
  const config = getConfig();
  const token = makeSessionToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.config.upsert({
    where: { key: `magic_link:${token}` },
    update: { value: JSON.stringify({ email, expiresAt: expiresAt.toISOString() }) },
    create: { key: `magic_link:${token}`, value: JSON.stringify({ email, expiresAt: expiresAt.toISOString() }) },
  });

  const magicUrl = `${config.nextauthUrl}/account/verify?token=${token}`;
  const res = await sendMagicLink(email, token);
  return {
    ...res,
    magicUrl: config.email.devLog || config.payment.sandbox ? magicUrl : undefined,
  };
}

export async function verifyMagicLink(token: string): Promise<{ email?: string; error?: string }> {
  const cfg = await prisma.config.findUnique({ where: { key: `magic_link:${token}` } });
  if (!cfg) return { error: "Mã liên kết không hợp lệ hoặc đã hết hạn" };

  const data = JSON.parse(cfg.value) as { email: string; expiresAt: string };
  if (new Date(data.expiresAt) < new Date()) {
    await prisma.config.delete({ where: { key: `magic_link:${token}` } });
    return { error: "Mã liên kết đã hết hạn" };
  }

  await prisma.config.delete({ where: { key: `magic_link:${token}` } });
  return { email: data.email };
}

export async function getOrCreateCustomer(email: string) {
  return prisma.customer.upsert({
    where: { email },
    update: {},
    create: { email, name: email },
  });
}
