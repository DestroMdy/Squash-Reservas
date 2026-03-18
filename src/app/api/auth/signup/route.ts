import { NextRequest, NextResponse } from "next/server";

type RecaptchaVerification = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

const RECAPTCHA_THRESHOLD = 0.5;

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

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
  const recaptchaSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!supabaseUrl || !anonKey || !recaptchaSecret || !recaptchaSiteKey) {
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
    return NextResponse.json(
      {
        error: "No se pudo validar el captcha.",
        debug
      },
      { status: 400 }
    );
  }

  if (verification.action !== "register") {
    return NextResponse.json(
      {
        error: "La validación del captcha no corresponde al registro.",
        debug
      },
      { status: 400 }
    );
  }

  if ((verification.score ?? 0) < RECAPTCHA_THRESHOLD) {
    return NextResponse.json(
      {
        error: "El registro fue bloqueado por validación anti-bots.",
        debug
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
        error: "El captcha fue emitido para otro dominio.",
        debug
      },
      { status: 400 }
    );
  }

  const signupResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
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
  });

  const signupData = (await signupResponse.json()) as {
    error_description?: string;
    msg?: string;
  };

  if (!signupResponse.ok) {
    return NextResponse.json(
      {
        error:
          signupData.error_description ||
          signupData.msg ||
          "No se pudo crear la cuenta."
      },
      { status: signupResponse.status }
    );
  }

  return NextResponse.json({ ok: true });
}
