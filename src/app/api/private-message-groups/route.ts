import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "@/lib/server-rate-limit";

type SupabaseUser = {
  id: string;
  email?: string;
};

type CreateGroupBody = {
  name?: string;
  memberIds?: string[];
};

function adminHeaders(apiKey: string) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function isMissingGroupsError(text: string) {
  return (
    text.includes("private_message_groups") ||
    text.includes("private_message_group_members") ||
    text.includes("private_group_messages")
  );
}

async function requireAuth(request: NextRequest) {
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
  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    accessToken,
    user
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const membershipsResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=group_id,last_read_at&user_id=eq.${auth.user.id}`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey)
    }
  );

  const membershipsText = await membershipsResponse.text();

  if (!membershipsResponse.ok) {
    if (isMissingGroupsError(membershipsText)) {
      return NextResponse.json({ groups: [], unavailable: true });
    }

    return NextResponse.json(
      { error: "No se pudieron cargar los grupos." },
      { status: 400 }
    );
  }

  const memberships = membershipsText.trim() ? JSON.parse(membershipsText) : [];
  const groupIds = memberships.map(
    (membership: { group_id: string }) => membership.group_id
  );

  if (!groupIds.length) {
    return NextResponse.json({ groups: [], unavailable: false });
  }

  const groupFilter = groupIds.join(",");

  const [groupsResponse, membersResponse, messagesResponse] = await Promise.all([
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_groups?select=id,name,created_by,created_at,updated_at&id=in.(${groupFilter})&order=updated_at.desc`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    ),
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=group_id,user_id,profiles(id,full_name,category,avatar_url)&group_id=in.(${groupFilter})`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    ),
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_group_messages?select=id,group_id,sender_id,body,created_at,profiles(full_name)&group_id=in.(${groupFilter})&order=created_at.desc`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    )
  ]);

  const groupsText = await groupsResponse.text();
  const membersText = await membersResponse.text();
  const messagesText = await messagesResponse.text();

  if (!groupsResponse.ok || !membersResponse.ok || !messagesResponse.ok) {
    return NextResponse.json(
      { error: "No se pudieron cargar los grupos privados." },
      { status: 400 }
    );
  }

  const groups = groupsText.trim() ? JSON.parse(groupsText) : [];
  const members = membersText.trim() ? JSON.parse(membersText) : [];
  const messages = messagesText.trim() ? JSON.parse(messagesText) : [];

  const membershipMap = new Map<
    string,
    { group_id: string; last_read_at?: string | null }
  >(
    memberships.map(
      (membership: { group_id: string; last_read_at?: string | null }) => [
        membership.group_id,
        membership
      ]
    )
  );

  const enrichedGroups = groups.map(
    (group: {
      id: string;
      name: string;
      created_by: string;
      created_at: string;
      updated_at: string;
    }) => {
      const groupMembers = members
        .filter((member: { group_id: string }) => member.group_id === group.id)
        .map(
          (member: {
            profiles?: {
              id: string;
              full_name?: string | null;
              category?: string | null;
              avatar_url?: string | null;
            } | null;
          }) => member.profiles
        )
        .filter(Boolean);

      const lastReadAt = membershipMap.get(group.id)?.last_read_at;
      const groupMessages = messages.filter(
        (message: {
          id: string;
          group_id: string;
          sender_id: string;
          body?: string | null;
          created_at: string;
          profiles?: { full_name?: string | null } | null;
        }) => message.group_id === group.id
      );

      const unreadCount = groupMessages.filter(
        (message: { sender_id: string; created_at: string }) =>
          message.sender_id !== auth.user.id &&
          (!lastReadAt || new Date(message.created_at) > new Date(lastReadAt))
      ).length;
      const latestMessage = groupMessages[0];

      return {
        ...group,
        members: groupMembers,
        unread_count: unreadCount,
        last_message_at: latestMessage?.created_at || null,
        last_message_id: latestMessage?.id || null,
        last_message_body: latestMessage?.body || null,
        last_message_sender_name:
          latestMessage?.profiles?.full_name || null
      };
    }
  );

  return NextResponse.json({
    groups: enrichedGroups,
    unavailable: false
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as CreateGroupBody;
  const name = body.name?.trim() || "";
  const memberIds = Array.from(
    new Set((body.memberIds || []).filter((memberId) => memberId && memberId !== auth.user.id))
  );

  if (!name) {
    return NextResponse.json(
      { error: "El grupo necesita un nombre." },
      { status: 400 }
    );
  }

  if (!memberIds.length) {
    return NextResponse.json(
      { error: "Debes agregar al menos un integrante." },
      { status: 400 }
    );
  }

  const ip = getRequestIp(request);
  const rateLimit = await checkRateLimit({
    key: `private-group-create:${ip}:${auth.user.id}`,
    max: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos de creación de grupos. Intenta más tarde." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds)
        }
      }
    );
  }

  const groupResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_groups`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        name,
        created_by: auth.user.id
      })
    }
  );

  const groupText = await groupResponse.text();

  if (!groupResponse.ok) {
    if (isMissingGroupsError(groupText)) {
      return NextResponse.json(
        {
          error:
            "Los grupos privados todavía no están habilitados en la base. Falta correr la migración SQL."
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "No se pudo crear el grupo." },
      { status: 400 }
    );
  }

  const createdGroups = groupText.trim() ? JSON.parse(groupText) : [];
  const createdGroup = createdGroups[0];

  if (!createdGroup?.id) {
    return NextResponse.json(
      { error: "No se pudo crear el grupo." },
      { status: 400 }
    );
  }

  const allMemberIds = [auth.user.id, ...memberIds];
  const membersResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_group_members`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=minimal"
      },
      body: JSON.stringify(
        allMemberIds.map((memberId) => ({
          group_id: createdGroup.id,
          user_id: memberId,
          added_by: auth.user.id,
          last_read_at: new Date().toISOString()
        }))
      )
    }
  );

  if (!membersResponse.ok) {
    return NextResponse.json(
      { error: "El grupo se creó, pero no se pudieron guardar los integrantes." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    group: {
      ...createdGroup,
      members: []
    }
  });
}
