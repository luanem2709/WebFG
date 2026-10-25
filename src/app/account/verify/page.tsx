import { redirect } from "next/navigation";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (token) {
    redirect(`/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`);
  }
  redirect("/account");
}
