import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, requireAuthenticatedRequest } from "@/lib/server-auth";
import { isGeneralMessageGroupName } from "@/lib/message-groups";
import {
  fetchProfileCompletionStatus,
  INCOMPLETE_PROFILE_MESSAGES_ERROR,
  isProfileCompletionRecordComplete
} from "@/lib/profile-completion";

type UpdateGroupBody = {
  name?: string;
  memberIds?: string[];
};

async function requireGroupCreator(request: NextRequest, groupId: string) {
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

  const groupResponse = await fetch(
    `${auth.supabaseUrl}/rest/v1/private_message_groups?select=id,name,created_by&id=eq.${groupId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(auth.serviceRoleKey),
      cache: "no-store"
    }
  );

  const groupText = await groupResponse.text();
  const groups = groupText.trim() ? JSON.parse(groupText) : [];
  const group = groups[0];

  if (!groupResponse.ok || !group) {
    return { error: "No se encontró el grupo.", status: 404 as const };
  }

  if (isGeneralMessageGroupName(group.name)) {
    return {
      error: "El grupo general del club se administra automáticamente.",
      status: 403 as const
    };
  }

  if (group.created_by !== auth.user.id) {
    return {
      error: "Solo quien creó el grupo puede editarlo.",
      status: 403 as const
    };
  }

  return {
    ...auth,
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

  if (isGeneralMessageGroupName(name)) {
    return NextResponse.json(
      { error: "Ese nombre está reservado para el grupo general del club." },
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
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
      }
    ),
    fetch(
      `${auth.supabaseUrl}/rest/v1/profiles?select=id,full_name,phone,category,avatar_url&id=in.(${[auth.user.id, ...memberIds].join(",")})`,
      {
        method: "GET",
        headers: adminHeaders(auth.serviceRoleKey),
        cache: "no-store"
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

  if (
    [auth.user.id, ...memberIds].some((memberId) => !allowedPlayerIds.has(memberId))
  ) {
    return NextResponse.json(
      { error: "Uno o más integrantes no son válidos." },
      { status: 400 }
    );
  }

  const hasIncompleteMember = players.some(
    (player: {
      id: string;
      full_name?: string | null;
      phone?: string | null;
      category?: string | null;
    }) => desiredIds.has(player.id) && !isProfileCompletionRecordComplete(player)
  );

  if (hasIncompleteMember) {
    return NextResponse.json(
      {
        error:
          "Solo puedes dejar en el grupo a jugadores que ya completaron su perfil."
      },
      { status: 403 }
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
      body: JSON.stringify({ name }),
      cache: "no-store"
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
        ),
        cache: "no-store"
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
        },
        cache: "no-store"
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
