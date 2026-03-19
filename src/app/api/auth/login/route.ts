import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";

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

  const userData = userResponse.ok
    ? ((await userResponse.json()) as { id: string; email?: string })
    : undefined;

  return NextResponse.json({
    ...loginData,
    user: userData
  });
}
