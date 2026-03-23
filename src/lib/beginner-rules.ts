import "server-only";
import { getBeginnerRulesAcknowledgedAt, setBeginnerRulesAcknowledgedAt } from "@/lib/beginner-rules-store";
import { adminHeaders } from "@/lib/server-auth";

export function isBeginnerCategory(category: string | null | undefined) {
  return category?.trim().toLowerCase() === "principiante";
}

export async function fetchUserProfileCategory(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=category&id=eq.${userId}&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  const rows = (await response.json()) as Array<{ category?: string | null }>;

  if (!response.ok) {
    throw new Error("No se pudo cargar la categoria del perfil.");
  }

  return rows[0]?.category ?? null;
}

export async function getBeginnerRulesStatus(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const [category, acknowledgedAt] = await Promise.all([
    fetchUserProfileCategory(supabaseUrl, serviceRoleKey, userId),
    getBeginnerRulesAcknowledgedAt(userId)
  ]);

  return {
    category,
    acknowledgedAt,
    required: isBeginnerCategory(category) && !acknowledgedAt
  };
}

export async function acknowledgeBeginnerRules(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string
) {
  const category = await fetchUserProfileCategory(
    supabaseUrl,
    serviceRoleKey,
    userId
  );

  if (!isBeginnerCategory(category)) {
    return {
      category,
      acknowledgedAt: null,
      required: false
    };
  }

  const acknowledgedAt = await setBeginnerRulesAcknowledgedAt(userId);

  return {
    category,
    acknowledgedAt,
    required: false
  };
}
