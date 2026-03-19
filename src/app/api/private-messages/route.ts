import { NextRequest, NextResponse } from "next/server";

type SupabaseUser = {
  id: string;
  email?: string;
};

type ProfileRecord = {
  id: string;
  full_name?: string | null;
  category?: string | null;
};

type CreateMessageBody = {
  sender_id?: string;
  recipient_id?: string;
  body?: string;
};

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function fetchAuthUserById(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/auth/v1/admin/users/${userId}`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    user?: { email?: string | null };
    email?: string | null;
  };

  return payload.user?.email || payload.email || null;
}

async function sendNotificationEmail({
  apiKey,
  from,
  to,
  senderName,
  appUrl,
  messageBody
}: {
  apiKey: string;
  from: string;
  to: string;
  senderName: string;
  appUrl: string;
  messageBody: string;
}) {
  const preview =
    messageBody.length > 180 ? `${messageBody.slice(0, 177)}...` : messageBody;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${senderName} te envió un mensaje privado`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
          <h2 style="margin-bottom:12px">Nuevo mensaje privado</h2>
          <p><strong>${senderName}</strong> te escribió en Squash Reservas.</p>
          <blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid #0f172a;background:#f8fafc">
            ${preview.replace(/\n/g, "<br />")}
          </blockquote>
          <p>
            Abrí tu bandeja para responder:
            <a href="${appUrl}/messages" style="color:#2563eb">${appUrl}/messages</a>
          </p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "No se pudo enviar el email.");
  }
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "Squash Reservas <onboarding@resend.dev>";
  const authHeader = request.headers.get("authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configuración de Supabase para enviar mensajes." },
      { status: 503 }
    );
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const body = (await request.json()) as CreateMessageBody;

  if (!body.sender_id || !body.recipient_id || !body.body?.trim()) {
    return NextResponse.json(
      { error: "Faltan datos para enviar el mensaje." },
      { status: 400 }
    );
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
  }

  const user = (await userResponse.json()) as SupabaseUser;

  if (user.id !== body.sender_id) {
    return NextResponse.json(
      { error: "No puedes enviar mensajes en nombre de otro usuario." },
      { status: 403 }
    );
  }

  const profilesResponse = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,category&id=in.(${body.sender_id},${body.recipient_id})`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  const profiles = (await profilesResponse.json()) as ProfileRecord[];
  const senderProfile = profiles.find((profile) => profile.id === body.sender_id);
  const recipientProfile = profiles.find((profile) => profile.id === body.recipient_id);

  if (!senderProfile || !recipientProfile) {
    return NextResponse.json(
      { error: "No se encontró el emisor o destinatario." },
      { status: 404 }
    );
  }

  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/private_messages`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      sender_id: body.sender_id,
      recipient_id: body.recipient_id,
      body: body.body.trim()
    })
  });

  const insertText = await insertResponse.text();
  const insertedMessages = insertText.trim() ? JSON.parse(insertText) : [];

  if (!insertResponse.ok || !insertedMessages.length) {
    return NextResponse.json(
      { error: "No se pudo guardar el mensaje privado." },
      { status: 400 }
    );
  }

  if (resendApiKey) {
    try {
      const recipientEmail = await fetchAuthUserById(
        supabaseUrl,
        serviceRoleKey,
        body.recipient_id
      );

      if (recipientEmail) {
        const senderName =
          senderProfile.full_name?.trim() || user.email || "Un jugador";

        await sendNotificationEmail({
          apiKey: resendApiKey,
          from: fromEmail,
          to: recipientEmail,
          senderName,
          appUrl: request.nextUrl.origin,
          messageBody: body.body.trim()
        });
      }
    } catch {
      // Keep message delivery successful even if mail provider fails.
    }
  }

  return NextResponse.json({ ok: true, message: insertedMessages[0] });
}
