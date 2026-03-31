import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_PROFILE_MATCHES_ERROR,
  isProfileCompletionRecordComplete
} from "@/lib/profile-completion";

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

  it("expone el mensaje de bloqueo para partidos", () => {
    expect(INCOMPLETE_PROFILE_MATCHES_ERROR).toContain("partidos");
  });
});
