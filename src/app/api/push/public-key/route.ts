import { NextResponse } from "next/server";
import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/web-push";

export async function GET() {
  const publicKey = getWebPushPublicKey();

  return NextResponse.json({
    available: isWebPushConfigured(),
    publicKey
  });
}
