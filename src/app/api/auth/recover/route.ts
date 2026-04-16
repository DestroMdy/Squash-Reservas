import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import { adminHeaders } from "@/lib/server-auth";

const defaultPublicAppOrigin = "https://squashreservas.vercel.app";

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolveRecoveryRedirect(
  request: NextRequest,
  providedRedirectTo?: string
) {
  const fallback = new URL("/reset-password", request.nextUrl.origin);

  if (!providedRedirectTo) {
    return fallback.toString();
  }

  try {
    const candidate = new URL(providedRedirectTo);
    const candidateHostname = candidate.hostname.toLowerCase();
    const requestHostname = request.nextUrl.hostname.toLowerCase();

    if (isLocalHostname(candidateHostname) && !isLocalHostname(requestHostname)) {
      return fallback.toString();
    }

    if (candidate.protocol !== "http:" && candidate.protocol !== "https:") {
      return fallback.toString();
    }

    candidate.pathname = "/reset-password";
    candidate.search = "";
    return candidate.toString();
  } catch {
    return fallback.toString();
  }
}

function resolveAppOrigin(request: NextRequest, redirectTo: string) {
  try {
    const redirectUrl = new URL(redirectTo);
    if (!isLocalHostname(redirectUrl.hostname.toLowerCase())) {
      return redirectUrl.origin;
    }
  } catch {
    // Ignore invalid URLs and fall back below.
  }

  if (!isLocalHostname(request.nextUrl.hostname.toLowerCase())) {
    return request.nextUrl.origin;
  }

  return defaultPublicAppOrigin;
}

function normalizeRecoverError(message: string) {
  const normalized = message.trim().toLowerCase();

  if (normalized.includes("user not found") || normalized.includes("no user found")) {
    return "unknown-user";
  }

  return "generic";
}

async function sendRecoveryEmail({
  apiKey,
  from,
  to,
  resetLink,
  appOrigin
}: {
  apiKey: string;
  from: string;
  to: string;
  resetLink: string;
  appOrigin: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Recuperá tu contraseña",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:12px">Cambiar contraseña</h2>
          <p>Recibimos un pedido para cambiar la contraseña de tu cuenta en Squash.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700">
              Elegir una nueva contraseña
            </a>
          </p>
          <p>Si el botón no abre, podés usar este enlace:</p>
          <p><a href="${resetLink}" style="color:#2563eb">${resetLink}</a></p>
          <p style="margin-top:20px;color:#475569">
            Después del cambio vas a poder volver a entrar desde
            <a href="${appOrigin}/login" style="color:#2563eb">${appOrigin}/login</a>.
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "No se pudo enviar el mail.");
  }
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL || "Squash Reservas <onboarding@resend.dev>";

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
  const redirectTo = resolveRecoveryRedirect(request, body.redirectTo);
  const appOrigin = resolveAppOrigin(request, redirectTo);
  const normalizedEmail = body.email?.trim().toLowerCase() || "";

  if (!normalizedEmail) {
    return NextResponse.json(
      { error: "El email es obligatorio." },
      { status: 400 }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `auth-recover:${ip}:${normalizedEmail}`,
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

  if (serviceRoleKey && resendApiKey) {
    const generateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: adminHeaders(serviceRoleKey),
      body: JSON.stringify({
        type: "recovery",
        email: normalizedEmail,
        redirect_to: redirectTo
      }),
      cache: "no-store"
    });

    const generateData = (await generateResponse.json().catch(() => ({}))) as {
      action_link?: string;
      hashed_token?: string;
      error?: string;
      msg?: string;
      error_description?: string;
    };

    if (!generateResponse.ok) {
      const rawError =
        generateData.error_description ||
        generateData.error ||
        generateData.msg ||
        "No se pudo generar el enlace de recuperación.";

      if (normalizeRecoverError(rawError) === "unknown-user") {
        return NextResponse.json({ ok: true });
      }

      return NextResponse.json({ error: rawError }, { status: generateResponse.status });
    }

    const tokenHash = generateData.hashed_token?.trim();

    if (!tokenHash) {
      return NextResponse.json(
        { error: "No se pudo generar el enlace de recuperación." },
        { status: 500 }
      );
    }
    const resetLink = new URL("/reset-password", appOrigin);
    resetLink.searchParams.set("token_hash", tokenHash);
    resetLink.searchParams.set("type", "recovery");

    try {
      await sendRecoveryEmail({
        apiKey: resendApiKey,
        from: fromEmail,
        to: normalizedEmail,
        resetLink: resetLink.toString(),
        appOrigin
      });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "No se pudo enviar el mail."
        },
        { status: 502 }
      );
    }
  }

  const recoverResponse = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: normalizedEmail,
      redirect_to: redirectTo
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
