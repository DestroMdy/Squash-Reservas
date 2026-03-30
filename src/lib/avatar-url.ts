const AVATAR_PUBLIC_MARKER = "/storage/v1/object/public/avatars/";

export function buildAvatarPublicUrl(
  supabaseUrl: string,
  filePath: string,
  version: string | number = Date.now()
) {
  return `${supabaseUrl}/storage/v1/object/public/avatars/${filePath}?v=${version}`;
}

export function getAvatarStoragePath(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return null;

  const index = avatarUrl.indexOf(AVATAR_PUBLIC_MARKER);

  if (index === -1) {
    return null;
  }

  const rawPath = avatarUrl.slice(index + AVATAR_PUBLIC_MARKER.length);
  return rawPath.split("?")[0].split("#")[0] || null;
}
