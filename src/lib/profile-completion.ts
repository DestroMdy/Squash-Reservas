export const INCOMPLETE_PROFILE_MESSAGES_ERROR =
  "Debes completar tu perfil antes de usar los mensajes.";
export const INCOMPLETE_PROFILE_MATCHES_ERROR =
  "Debes completar tu perfil antes de usar los partidos.";

type ProfileCompletionRecord = {
  full_name?: string | null;
  phone?: string | null;
  category?: string | null;
};

export function isProfileCompletionRecordComplete(
  profile?: ProfileCompletionRecord | null
) {
  return Boolean(
    profile?.full_name?.trim() &&
      profile?.phone?.trim() &&
      profile?.category?.trim()
  );
}

export async function fetchProfileCompletionStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,full_name,phone,category&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      cache: "no-store"
    }
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error("No se pudo validar el perfil del usuario.");
  }

  const rows = text.trim() ? JSON.parse(text) : [];
  const profile = rows[0] as
    | (ProfileCompletionRecord & {
        id?: string;
      })
    | undefined;

  return {
    profile: profile ?? null,
    complete: isProfileCompletionRecordComplete(profile)
  };
}
