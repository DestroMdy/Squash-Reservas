export const REFRESH_COOKIE_NAME = "sr_refresh_token";
export const USER_COOKIE_NAME = "sr_user";

export type SessionUser = {
  id: string;
  email?: string;
};

export function encodeUserCookie(user?: SessionUser | null) {
  if (!user?.id) {
    return "";
  }

  return encodeURIComponent(JSON.stringify(user));
}

export function decodeUserCookie(value?: string | null): SessionUser | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as SessionUser;
  } catch {}

  try {
    return JSON.parse(decodeURIComponent(value)) as SessionUser;
  } catch {}

  try {
    return JSON.parse(decodeURIComponent(decodeURIComponent(value))) as SessionUser;
  } catch {
    return null;
  }
}
