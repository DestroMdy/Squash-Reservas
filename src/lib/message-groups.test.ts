import { describe, expect, it } from "vitest";
import {
  GENERAL_MESSAGE_GROUP_NAME,
  isGeneralMessageGroupName,
  sortPrivateMessageGroups
} from "@/lib/message-groups";

describe("message-groups", () => {
  it("detecta el grupo general por nombre reservado", () => {
    expect(isGeneralMessageGroupName(GENERAL_MESSAGE_GROUP_NAME)).toBe(true);
    expect(isGeneralMessageGroupName(" grupo general ")).toBe(true);
    expect(isGeneralMessageGroupName("Mi grupo del viernes")).toBe(false);
  });

  it("ordena el grupo general primero y luego el resto por actividad", () => {
    const groups = sortPrivateMessageGroups([
      {
        id: "custom-older",
        updated_at: "2026-03-28T10:00:00.000Z",
        is_general: false
      },
      {
        id: "general",
        updated_at: "2026-03-01T10:00:00.000Z",
        is_general: true
      },
      {
        id: "custom-newer",
        updated_at: "2026-03-29T10:00:00.000Z",
        is_general: false
      }
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "general",
      "custom-newer",
      "custom-older"
    ]);
  });
});
