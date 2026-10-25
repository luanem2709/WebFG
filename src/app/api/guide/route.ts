import { NextResponse } from "next/server";
import { getGuideSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await getGuideSettings();
  return NextResponse.json({
    downloadUrl: g.downloadConfigured ? g.downloadUrl : null,
    steps: g.steps,
    supportContact: g.supportContact,
  });
}
