import "server-only";

export type LiveAvatarProfile = {
  full_name: string | null;
  avatar_url?: string | null;
};

export async function fetchProfilesForLiveAvatars() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return [];
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=full_name,avatar_url&avatar_url=not.is.null&full_name=not.is.null`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as LiveAvatarProfile[];
}
