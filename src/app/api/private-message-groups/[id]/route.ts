import { NextRequest, NextResponse } from "next/server";

type SupabaseUser = {
  id: string;
  email?: string;
};

type UpdateGroupBody = {
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

async function requireGroupCreator(
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
  const groupResponse = await fetch(
    `${supabaseUrl}/rest/v1/private_message_groups?select=id,name,created_by&id=eq.${groupId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey)
    }
  );

  const groupText = await groupResponse.text();
  const groups = groupText.trim() ? JSON.parse(groupText) : [];
  const group = groups[0];

  if (!groupResponse.ok || !group) {
    return { error: "No se encontró el grupo.", status: 404 as const };
  }

  if (group.created_by !== user.id) {
    return {
      error: "Solo quien creó el grupo puede editarlo.",
      status: 403 as const
    };
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    user,
    group
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGroupCreator(request, params.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json()) as UpdateGroupBody;
  const name = body.name?.trim() || "";
  const memberIds = Array.from(
    new Set(
      (body.memberIds || []).filter(
        (memberId) => Boolean(memberId) && memberId !== auth.user.id
      )
    )
  );

  if (!name) {
    return NextResponse.json(
      { error: "El grupo necesita un nombre." },
      { status: 400 }
    );
  }

  if (!memberIds.length) {
    return NextResponse.json(
      { error: "Debes dejar al menos un integrante además de ti." },
      { status: 400 }
    );
  }

  const [membersResponse, playersResponse] = await Promise.all([
    fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_group_members?select=user_id&group_id=eq.${params.id}`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    ),
    fetch(
      `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,category,avatar_url&id=in.(${[auth.user.id, ...memberIds].join(",")})`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey)
      }
    )
  ]);

  const membersText = await membersResponse.text();
  const playersText = await playersResponse.text();

  if (!membersResponse.ok || !playersResponse.ok) {
    return NextResponse.json(
      { error: "No se pudo validar la edición del grupo." },
      { status: 400 }
    );
  }

  const existingMembers = membersText.trim() ? JSON.parse(membersText) : [];
  const players = playersText.trim() ? JSON.parse(playersText) : [];
  const allowedPlayerIds = new Set(players.map((player: { id: string }) => player.id));

  if ([auth.user.id, ...memberIds].some((memberId) => !allowedPlayerIds.has(memberId))) {
    return NextResponse.json(
      { error: "Uno o más integrantes no son válidos." },
      { status: 400 }
    );
  }

  const existingIds = new Set<string>(
    existingMembers.map((member: { user_id: string }) => member.user_id)
  );
  const desiredIds = new Set<string>([auth.user.id, ...memberIds]);
  const idsToAdd = [...desiredIds].filter((memberId) => !existingIds.has(memberId));
  const idsToRemove = [...existingIds].filter((memberId) => !desiredIds.has(memberId));

  const updateGroupResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_groups?id=eq.${params.id}`,
    {
      method: "PATCH",
      headers: {
        ...adminHeaders(auth.serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({ name })
    }
  );

  const updateGroupText = await updateGroupResponse.text();
  const updatedGroups = updateGroupText.trim() ? JSON.parse(updateGroupText) : [];
  const updatedGroup = updatedGroups[0];

  if (!updateGroupResponse.ok || !updatedGroup) {
    return NextResponse.json(
      { error: "No se pudo actualizar el nombre del grupo." },
      { status: 400 }
    );
  }

  if (idsToAdd.length) {
    const addResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_group_members`,
      {
        method: "POST",
        headers: {
          ...adminHeaders(auth.serviceRoleKey),
          Prefer: "return=minimal"
        },
        body: JSON.stringify(
          idsToAdd.map((memberId) => ({
            group_id: params.id,
            user_id: memberId,
            added_by: auth.user.id
          }))
        )
      }
    );

    if (!addResponse.ok) {
      return NextResponse.json(
        { error: "No se pudieron agregar integrantes al grupo." },
        { status: 400 }
      );
    }
  }

  if (idsToRemove.length) {
    const removeFilter = idsToRemove.join(",");
    const removeResponse = await fetch(
      `${auth.supabaseUrl}/rest/v1/private_message_group_members?group_id=eq.${params.id}&user_id=in.(${removeFilter})`,
      {
        method: "DELETE",
        headers: {
          ...adminHeaders(auth.serviceRoleKey),
          Prefer: "return=minimal"
        }
      }
    );

    if (!removeResponse.ok) {
      return NextResponse.json(
        { error: "No se pudieron quitar integrantes del grupo." },
        { status: 400 }
      );
    }
  }

  const refreshedMembers = players.filter((player: { id: string }) =>
    desiredIds.has(player.id)
  );

  return NextResponse.json({
    ok: true,
    group: {
      ...updatedGroup,
      members: refreshedMembers
    }
  });
}
