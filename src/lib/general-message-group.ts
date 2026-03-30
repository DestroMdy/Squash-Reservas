import "server-only";
import { adminHeaders } from "@/lib/server-auth";
import { GENERAL_MESSAGE_GROUP_NAME } from "@/lib/message-groups";

type GeneralGroupRecord = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

async function fetchGeneralGroup(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<GeneralGroupRecord | null> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/private_message_groups?select=id,name,created_by,created_at,updated_at&name=eq.${encodeURIComponent(GENERAL_MESSAGE_GROUP_NAME)}&order=created_at.asc&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || "No se pudo consultar el grupo general.");
  }

  const rows = text.trim() ? (JSON.parse(text) as GeneralGroupRecord[]) : [];
  return rows[0] || null;
}

export async function ensureGeneralMessageGroup(options: {
  supabaseUrl: string;
  serviceRoleKey: string;
  actorUserId: string;
}) {
  const { supabaseUrl, serviceRoleKey, actorUserId } = options;

  let group = await fetchGeneralGroup(supabaseUrl, serviceRoleKey);

  if (!group) {
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/private_message_groups`, {
      method: "POST",
      headers: {
        ...adminHeaders(serviceRoleKey),
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        name: GENERAL_MESSAGE_GROUP_NAME,
        created_by: actorUserId
      }),
      cache: "no-store"
    });

    const createText = await createResponse.text();
    const createdRows = createText.trim()
      ? (JSON.parse(createText) as GeneralGroupRecord[])
      : [];

    group = createdRows[0] || null;

    if (!createResponse.ok || !group) {
      group = await fetchGeneralGroup(supabaseUrl, serviceRoleKey);
    }

    if (!group) {
      throw new Error(createText || "No se pudo crear el grupo general.");
    }
  }

  const [profilesResponse, membersResponse] = await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/profiles?select=id`, {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }),
    fetch(
      `${supabaseUrl}/rest/v1/private_message_group_members?select=user_id&group_id=eq.${group.id}`,
      {
        method: "GET",
        headers: adminHeaders(serviceRoleKey),
        cache: "no-store"
      }
    )
  ]);

  const profilesText = await profilesResponse.text();
  const membersText = await membersResponse.text();

  if (!profilesResponse.ok || !membersResponse.ok) {
    throw new Error(
      profilesText || membersText || "No se pudieron sincronizar los integrantes del grupo general."
    );
  }

  const profileRows = profilesText.trim()
    ? (JSON.parse(profilesText) as Array<{ id: string }>)
    : [];
  const memberRows = membersText.trim()
    ? (JSON.parse(membersText) as Array<{ user_id: string }>)
    : [];

  const existingMemberIds = new Set(memberRows.map((member) => member.user_id));
  const missingMemberIds = profileRows
    .map((profile) => profile.id)
    .filter((profileId) => !existingMemberIds.has(profileId));

  if (missingMemberIds.length) {
    const addResponse = await fetch(
      `${supabaseUrl}/rest/v1/private_message_group_members?on_conflict=group_id,user_id`,
      {
        method: "POST",
        headers: {
          ...adminHeaders(serviceRoleKey),
          Prefer: "resolution=ignore-duplicates,return=minimal"
        },
        body: JSON.stringify(
          missingMemberIds.map((memberId) => ({
            group_id: group?.id,
            user_id: memberId,
            added_by: actorUserId,
            last_read_at: new Date().toISOString()
          }))
        ),
        cache: "no-store"
      }
    );

    if (!addResponse.ok) {
      const addText = await addResponse.text();
      throw new Error(addText || "No se pudieron agregar integrantes al grupo general.");
    }
  }

  return group;
}
