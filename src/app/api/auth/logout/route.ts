import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { REFRESH_COOKIE_NAME, USER_COOKIE_NAME } from "@/lib/session-cookies";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0"
} as const;

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(REFRESH_COOKIE_NAME);
  cookieStore.delete(USER_COOKIE_NAME);

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
