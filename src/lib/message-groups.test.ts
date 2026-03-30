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

  it("ordena los grupos por actividad reciente y usa el general solo como desempate", () => {
    const groups = sortPrivateMessageGroups([
      {
        id: "custom-older",
        last_message_at: "2026-03-28T10:00:00.000Z",
        updated_at: "2026-03-28T10:00:00.000Z",
        is_general: false
      },
      {
        id: "general",
        last_message_at: "2026-03-01T10:00:00.000Z",
        updated_at: "2026-03-01T10:00:00.000Z",
        is_general: true
      },
      {
        id: "custom-newer",
        last_message_at: "2026-03-29T10:00:00.000Z",
        updated_at: "2026-03-29T10:00:00.000Z",
        is_general: false
      }
    ]);

    expect(groups.map((group) => group.id)).toEqual([
      "custom-newer",
      "custom-older",
      "general"
    ]);
  });
});
