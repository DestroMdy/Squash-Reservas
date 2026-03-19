import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";

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
    redirectTo?: string;
  };

  if (!body.email) {
    return NextResponse.json(
      { error: "El email es obligatorio." },
      { status: 400 }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `auth-recover:${ip}:${body.email.trim().toLowerCase()}`,
    max: 5,
    windowMs: 15 * 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiadas solicitudes de recuperación. Intenta nuevamente más tarde."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const recoverResponse = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: body.email,
      ...(body.redirectTo ? { redirect_to: body.redirectTo } : {})
    })
  });

  const recoverData = (await recoverResponse.json()) as {
    msg?: string;
    error_description?: string;
  };

  if (!recoverResponse.ok) {
    return NextResponse.json(
      {
        error:
          recoverData.error_description ||
          recoverData.msg ||
          "No se pudo enviar el mail."
      },
      { status: recoverResponse.status }
    );
  }

  return NextResponse.json({ ok: true });
}
