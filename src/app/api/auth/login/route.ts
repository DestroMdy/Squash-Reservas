import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import {
  encodeUserCookie,
  REFRESH_COOKIE_NAME,
  USER_COOKIE_NAME
} from "@/lib/session-cookies";

type SessionPayload = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: {
    id: string;
    email?: string;
  };
  error_description?: string;
};

function shouldUseSecureCookies(request: NextRequest) {
  const host = request.headers.get("host") || "";
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { error: "Falta configuración de Supabase." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };

  if (!body.email || !body.password) {
    return NextResponse.json(
      { error: "Email y contraseña son obligatorios." },
      { status: 400 }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `auth-login:${ip}:${body.email.trim().toLowerCase()}`,
    max: 10,
    windowMs: 10 * 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos de inicio de sesión. Intenta nuevamente en unos minutos."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const loginResponse = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: body.email,
        password: body.password
      })
    }
  );

  const loginData = (await loginResponse.json()) as SessionPayload;

  if (!loginResponse.ok) {
    return NextResponse.json(
      {
        error: loginData.error_description || "No se pudo iniciar sesión."
      },
      { status: loginResponse.status }
    );
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${loginData.access_token}`
    }
  });

  const rawUser = userResponse.ok
    ? ((await userResponse.json()) as Record<string, unknown>)
    : ((loginData.user as unknown as Record<string, unknown> | undefined) ??
      undefined);

  const cookieStore = cookies();
  const secure = shouldUseSecureCookies(request);
  const user =
    typeof rawUser?.id === "string"
      ? {
          id: rawUser.id,
          email:
            typeof rawUser.email === "string" ? rawUser.email : undefined
        }
      : undefined;

  if (loginData.refresh_token) {
    cookieStore.set(REFRESH_COOKIE_NAME, loginData.refresh_token, {
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

  return NextResponse.json({
    access_token: loginData.access_token,
    refresh_token: loginData.refresh_token,
    token_type: loginData.token_type,
    expires_in: loginData.expires_in,
    user
  });
}
