import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import { sendWebPushToUserIds } from "@/lib/web-push";
import {
  fetchProfileCompletionStatus,
  INCOMPLETE_PROFILE_MESSAGES_ERROR
} from "@/lib/profile-completion";

function buildMessagePreview(value: string, maxLength = 140) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength
    ? `${compact.slice(0, maxLength - 3)}...`
    : compact;
}

async function requireGroupMember(request: NextRequest, groupId: string) {
  const auth = await requireAuthenticatedRequest(request, {
    requireServiceRole: true
  });

  if ("error" in auth) {
    return auth;
  }

  const profileStatus = await fetchProfileCompletionStatus(
    auth.supabaseUrl,
    auth.serviceRoleKey,
    auth.user.id
  );

  if (!profileStatus.complete) {
    return {
      error: INCOMPLETE_PROFILE_MESSAGES_ERROR,
      status: 403 as const
    };
  }

  const membershipResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=group_id,user_id,last_read_at&group_id=eq.${groupId}&user_id=eq.${auth.user.id}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
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

  return { ...auth, membership };
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
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
      }
    ),
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=user_id&group_id=eq.${params.id}`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
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
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
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
      }),
      cache: "no-store"
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
      }),
      cache: "no-store"
    }
  );

  const [groupResponse, membersResponse, senderProfileResponse] =
    await Promise.all([
      fetch(
        `${auth.supabaseUrl}/rest/v1/private_message_groups?select=name&id=eq.${params.id}&limit=1`,
        {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        }
      ),
      fetch(
        `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=user_id&group_id=eq.${params.id}&user_id=neq.${auth.user.id}`,
        {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        }
      ),
      fetch(
        `${auth.supabaseUrl}/rest/v1/profiles?select=full_name&id=eq.${auth.user.id}&limit=1`,
        {
          method: "GET",
          headers: adminHeaders(auth.serviceRoleKey),
          cache: "no-store"
        }
      )
    ]);

  if (groupResponse.ok && membersResponse.ok && senderProfileResponse.ok) {
    const [groupRows, memberRows, senderProfiles] = await Promise.all([
      groupResponse.json() as Promise<Array<{ name?: string | null }>>,
      membersResponse.json() as Promise<Array<{ user_id?: string | null }>>,
      senderProfileResponse.json() as Promise<Array<{ full_name?: string | null }>>
    ]);

    const recipientIds = memberRows
      .map((member) => member.user_id || "")
      .filter((value): value is string => Boolean(value));

    if (recipientIds.length) {
      const senderName =
        senderProfiles[0]?.full_name?.trim() || auth.user.email || "Un jugador";
      const groupName = groupRows[0]?.name?.trim() || "grupo privado";

      await sendWebPushToUserIds(recipientIds, {
        title: `Nuevo mensaje en ${groupName}`,
        body: `${senderName}: ${buildMessagePreview(messageBody)}`,
        url: "/messages",
        tag: `group-message-${insertedRows[0].id || params.id}`
      }).catch(() => null);
    }
  }

  return NextResponse.json({
    ok: true,
    message: insertedRows[0]
  });
}
