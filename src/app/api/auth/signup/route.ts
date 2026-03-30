import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ensureGeneralMessageGroup } from "@/lib/general-message-group";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import {
  encodeUserCookie,
  REFRESH_COOKIE_NAME,
  USER_COOKIE_NAME
} from "@/lib/session-cookies";

type RecaptchaVerification = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

const RECAPTCHA_THRESHOLD = 0.5;

type AdminUserPayload = {
  id?: string;
  user?: {
    id?: string;
  } | null;
  msg?: string;
  error?: string;
  message?: string;
  error_description?: string;
};

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

function buildRecaptchaDebug(verification: RecaptchaVerification) {
  return {
    success: verification.success ?? false,
    action: verification.action ?? null,
    score: verification.score ?? null,
    hostname: verification.hostname ?? null,
    challenge_ts: verification.challenge_ts ?? null,
    error_codes: verification["error-codes"] ?? []
  };
}

function normalizeSignupError(errorDescription?: string | null, message?: string | null) {
  const rawMessage = errorDescription || message || "";
  const normalized = rawMessage.trim().toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "Ya se enviaron demasiados mails de registro a esta dirección. Revisa tu bandeja o espera unos minutos antes de volver a intentar.";
  }

  if (
    normalized.includes("already been registered") ||
    normalized.includes("user already registered") ||
    normalized.includes("already registered")
  ) {
    return "Ya existe una cuenta registrada con ese email.";
  }

  if (
    normalized.includes("password should be at least") ||
    normalized.includes("password is too short")
  ) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  return rawMessage || "No se pudo crear la cuenta.";
}

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function shouldUseSecureCookies(request: NextRequest) {
  const host = request.headers.get("host") || "";
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
}

async function deleteAuthUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: adminHeaders(serviceRoleKey),
    cache: "no-store"
  }).catch(() => null);
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (
    !supabaseUrl ||
    !anonKey ||
    !serviceRoleKey ||
    !recaptchaSecret ||
    !recaptchaSiteKey
  ) {
    return NextResponse.json(
      { error: "Falta configurar reCAPTCHA para habilitar registros nuevos." },
      { status: 503 }
    );
  }

  const body = (await request.json()) as {
    email?: string;
    password?: string;
    captchaToken?: string;
  };

  if (!body.email || !body.password || !body.captchaToken) {
    return NextResponse.json(
      { error: "Email, contraseña y captcha son obligatorios." },
      { status: 400 }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `auth-signup:${ip}:${body.email.trim().toLowerCase()}`,
    max: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiados intentos de registro. Intenta nuevamente en unos minutos."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const verificationBody = new URLSearchParams();
  verificationBody.set("secret", recaptchaSecret);
  verificationBody.set("response", body.captchaToken);

  const verificationResponse = await fetch(
    "https://www.google.com/recaptcha/api/siteverify",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: verificationBody.toString()
    }
  );

  const verification =
    (await verificationResponse.json()) as RecaptchaVerification;
  const debug = buildRecaptchaDebug(verification);

  if (!verification.success) {
    console.warn("reCAPTCHA signup verification failed", debug);
    return NextResponse.json(
      {
        error: "No se pudo validar el captcha."
      },
      { status: 400 }
    );
  }

  if (verification.action !== "register") {
    return NextResponse.json(
      {
        error: "La validación del captcha no corresponde al registro."
      },
      { status: 400 }
    );
  }

  if ((verification.score ?? 0) < RECAPTCHA_THRESHOLD) {
    return NextResponse.json(
      {
        error: "El registro fue bloqueado por validación anti-bots."
      },
      { status: 400 }
    );
  }

  if (
    verification.hostname &&
    verification.hostname !== request.nextUrl.hostname
  ) {
    return NextResponse.json(
      {
        error: "El captcha fue emitido para otro dominio."
      },
      { status: 400 }
    );
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  const signupResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(serviceRoleKey),
    body: JSON.stringify({
      email: normalizedEmail,
      password: body.password,
      email_confirm: true
    }),
    cache: "no-store"
  });

  const signupData = (await signupResponse.json()) as AdminUserPayload;

  if (!signupResponse.ok) {
    return NextResponse.json(
      {
        error: normalizeSignupError(
          signupData.error_description,
          signupData.msg
        )
      },
      { status: signupResponse.status }
    );
  }

  const createdUserId = signupData.user?.id || signupData.id;

  if (!createdUserId) {
    return NextResponse.json(
      { error: "La cuenta se creó de forma incompleta. Intenta nuevamente." },
      { status: 500 }
    );
  }

  const profileResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?on_conflict=id`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id: createdUserId,
        role: "player"
      }),
      cache: "no-store"
    }
  );

  if (!profileResponse.ok) {
    await deleteAuthUser(supabaseUrl, serviceRoleKey, createdUserId);

    return NextResponse.json(
      { error: "No se pudo preparar el perfil inicial de la cuenta." },
      { status: 500 }
    );
  }

  try {
    await ensureGeneralMessageGroup({
      supabaseUrl,
      serviceRoleKey,
      actorUserId: createdUserId
    });
  } catch (error) {
    console.warn(
      "No se pudo sincronizar el grupo general al registrar usuario",
      error instanceof Error ? error.message : error
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
        email: normalizedEmail,
        password: body.password
      }),
      cache: "no-store"
    }
  );

  const loginData = (await loginResponse.json()) as SessionPayload;

  if (!loginResponse.ok || !loginData.access_token) {
    await deleteAuthUser(supabaseUrl, serviceRoleKey, createdUserId);

    return NextResponse.json(
      {
        error:
          loginData.error_description ||
          "La cuenta se creó, pero no se pudo iniciar sesión automáticamente."
      },
      { status: 500 }
    );
  }

  const cookieStore = cookies();
  const secure = shouldUseSecureCookies(request);
  const user = {
    id: createdUserId,
    email: normalizedEmail
  };

  if (loginData.refresh_token) {
    cookieStore.set(REFRESH_COOKIE_NAME, loginData.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 30
    });
  }

  cookieStore.set(USER_COOKIE_NAME, encodeUserCookie(user), {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return NextResponse.json({
    access_token: loginData.access_token,
    token_type: loginData.token_type,
    expires_in: loginData.expires_in,
    user
  });
}
