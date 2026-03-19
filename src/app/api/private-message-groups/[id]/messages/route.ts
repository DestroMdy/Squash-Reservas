import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";

type SupabaseUser = {
  id: string;
  email?: string;
};

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function requireGroupMember(
  request: NextRequest,
  groupId: string
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get("authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { error: "Falta configuración de backend.", status: 503 as const };
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "No autenticado", status: 401 as const };
  }

  const accessToken = authHeader.replace("Bearer ", "").trim();
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    return { error: "Sesión inválida.", status: 401 as const };
  }

  const user = (await userResponse.json()) as SupabaseUser;

  const membershipResponse = await fetch(
    `${supabaseUrl}/rest/v1/private_message_group_members?select=group_id,user_id,last_read_at&group_id=eq.${groupId}&user_id=eq.${user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  const membershipText = await membershipResponse.text();
  const membershipRows = membershipText.trim() ? JSON.parse(membershipText) : [];
  const membership = membershipRows[0];

  if (!membershipResponse.ok || !membership) {
    return {
      error: "No tienes acceso a este grupo privado.",
      status: 403 as const
    };
  }

  return { supabaseUrl, serviceRoleKey, user, membership };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGroupMember(request, params.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [messagesResponse, membersResponse] = await Promise.all([
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_group_messages?select=id,group_id,sender_id,body,created_at,updated_at&group_id=eq.${params.id}&order=created_at.asc`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    ),
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=user_id&group_id=eq.${params.id}`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    )
  ]);

  const messagesText = await messagesResponse.text();
  const membersText = await membersResponse.text();

  if (!messagesResponse.ok || !membersResponse.ok) {
    return NextResponse.json(
      { error: "No se pudo cargar la conversación grupal." },
      { status: 400 }
    );
  }

  const messages = messagesText.trim() ? JSON.parse(messagesText) : [];
  const memberRows = membersText.trim() ? JSON.parse(membersText) : [];
  const profileIds = Array.from(
    new Set<string>([
      ...memberRows.map((member: { user_id: string }) => member.user_id),
      ...messages.map((message: { sender_id: string }) => message.sender_id)
    ])
  );

  let profilesById = new Map<
    string,
    {
      id: string;
      full_name?: string | null;
      category?: string | null;
      avatar_url?: string | null;
    }
  >();

  if (profileIds.length) {
    const profilesResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,category,avatar_url&id=in.(${profileIds.join(",")})`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    );

    const profilesText = await profilesResponse.text();

    if (!profilesResponse.ok) {
      return NextResponse.json(
        { error: "No se pudieron cargar los perfiles del grupo." },
        { status: 400 }
      );
    }

    const profiles = profilesText.trim() ? JSON.parse(profilesText) : [];
    profilesById = new Map(
      profiles.map(
        (profile: {
          id: string;
          full_name?: string | null;
          category?: string | null;
          avatar_url?: string | null;
        }) => [profile.id, profile]
      )
    );
  }

  const normalizedMessages = messages.map(
    (message: {
      id: string;
      group_id: string;
      sender_id: string;
      body: string;
      created_at: string;
      updated_at: string;
    }) => ({
      ...message,
      profiles: profilesById.get(message.sender_id) || null
    })
  );
  const members = memberRows
    .map((member: { user_id: string }) => profilesById.get(member.user_id) || null)
    .filter(Boolean);

  return NextResponse.json({
    messages: normalizedMessages,
    members
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGroupMember(request, params.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as { body?: string };
  const messageBody = body.body?.trim() || "";

  if (!messageBody) {
    return NextResponse.json(
      { error: "Escribe un mensaje antes de enviarlo." },
      { status: 400 }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `private-group-message:${ip}:${auth.user.id}`,
    max: 20,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      {
        error:
          "Demasiados mensajes en poco tiempo. Espera unos segundos antes de volver a enviar."
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const insertResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_group_messages`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        group_id: params.id,
        sender_id: auth.user.id,
        body: messageBody
      })
    }
  );

  const insertText = await insertResponse.text();
  const insertedRows = insertText.trim() ? JSON.parse(insertText) : [];

  if (!insertResponse.ok || !insertedRows.length) {
    return NextResponse.json(
      { error: "No se pudo enviar el mensaje al grupo." },
      { status: 400 }
    );
  }

  await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_group_members?group_id=eq.${params.id}&user_id=eq.${auth.user.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        last_read_at: new Date().toISOString()
      })
    }
  );

  return NextResponse.json({
    ok: true,
    message: insertedRows[0]
  });
}
