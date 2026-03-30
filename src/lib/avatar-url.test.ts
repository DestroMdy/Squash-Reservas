import { describe, expect, it } from "vitest";
import { buildAvatarPublicUrl, getAvatarStoragePath } from "@/lib/avatar-url";

describe("avatar-url", () => {
  it("agrega un parametro de version para romper cache", () => {
    expect(
      buildAvatarPublicUrl(
        "https://demo.supabase.co",
        "user-1/avatar.jpg",
        "123456"
      )
    ).toBe(
      "https://demo.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=123456"
    );
  });

  it("recupera el path real del archivo aunque la url tenga query string", () => {
    expect(
      getAvatarStoragePath(
        "https://demo.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?v=123456"
      )
    ).toBe("user-1/avatar.jpg");
  });
});
