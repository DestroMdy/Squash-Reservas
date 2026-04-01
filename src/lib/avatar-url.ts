const AVATAR_BUCKET = "avatars";

export function buildPublicStorageUrl(
  supabaseUrl: string,
  bucket: string,
  filePath: string,
  version: string | number = Date.now()
) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}?v=${version}`;
}

export function getStoragePathFromPublicUrl(
  bucket: string,
  publicUrl: string | null | undefined
) {
  if (!publicUrl) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = publicUrl.indexOf(marker);

  if (index === -1) {
    return null;
  }

  const rawPath = publicUrl.slice(index + marker.length);
  return rawPath.split("?")[0].split("#")[0] || null;
}

export function buildAvatarPublicUrl(
  supabaseUrl: string,
  filePath: string,
  version: string | number = Date.now()
) {
  return buildPublicStorageUrl(supabaseUrl, AVATAR_BUCKET, filePath, version);
}

export function getAvatarStoragePath(avatarUrl: string | null | undefined) {
  return getStoragePathFromPublicUrl(AVATAR_BUCKET, avatarUrl);
}
