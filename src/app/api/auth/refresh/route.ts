import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  encodeUserCookie,
  REFRESH_COOKIE_NAME,
  USER_COOKIE_NAME
} from "@/lib/session-cookies";

type RefreshPayload = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: {
    id: string;
    email?: string;
  };
  error_description?: string;
};

function shouldUseSecureCookies(request: Request) {
  const host = request.headers.get("host") || "";
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0"
} as const;

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieStore = await cookies();
  const body = (await request.json().catch(() => ({}))) as {
    refreshToken?: string;
  };
  const refreshToken =
    cookieStore.get(REFRESH_COOKIE_NAME)?.value || body.refreshToken?.trim() || "";

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Falta configuración de Supabase." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  if (!refreshToken) {
    return NextResponse.json(
      { error: "No hay sesión para restaurar." },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const refreshResponse = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        refresh_token: refreshToken
      }),
      cache: "no-store"
    }
  );

  const refreshData = (await refreshResponse.json()) as RefreshPayload;

  if (!refreshResponse.ok || !refreshData.access_token) {
    cookieStore.delete(REFRESH_COOKIE_NAME);
    cookieStore.delete(USER_COOKIE_NAME);

    return NextResponse.json(
      {
        error:
          refreshData.error_description || "No se pudo restaurar la sesión."
      },
      { status: refreshResponse.status || 401, headers: NO_STORE_HEADERS }
    );
  }

  const secure = shouldUseSecureCookies(request);
  const user = refreshData.user?.id
    ? {
        id: refreshData.user.id,
        email: refreshData.user.email
      }
    : undefined;

  if (refreshData.refresh_token) {
    cookieStore.set(REFRESH_COOKIE_NAME, refreshData.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }

  if (user?.id) {
    cookieStore.set(USER_COOKIE_NAME, encodeUserCookie(user), {
      httpOnly: false,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }

  return NextResponse.json(
    {
      access_token: refreshData.access_token,
      refresh_token: refreshData.refresh_token,
      token_type: refreshData.token_type,
      expires_in: refreshData.expires_in,
      user
    },
    { headers: NO_STORE_HEADERS }
  );
}
