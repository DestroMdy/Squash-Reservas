import { describe, expect, it } from "vitest";
import { isProfileCompletionRecordComplete } from "@/lib/profile-completion";

describe("profile-completion", () => {
  it("detecta cuando un perfil está completo", () => {
    expect(
      isProfileCompletionRecordComplete({
        full_name: "Alan Freire",
        phone: "2804123456",
        category: "Tercera"
      })
    ).toBe(true);
  });

  it("detecta cuando falta un dato obligatorio", () => {
    expect(
      isProfileCompletionRecordComplete({
        full_name: "Alan Freire",
        phone: "",
        category: "Tercera"
      })
    ).toBe(false);
  });
});
