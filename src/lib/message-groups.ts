export const GENERAL_MESSAGE_GROUP_NAME = "Grupo general";

export function isGeneralMessageGroupName(name?: string | null) {
  return (name || "").trim().toLowerCase() === GENERAL_MESSAGE_GROUP_NAME.toLowerCase();
}

export function sortPrivateMessageGroups<
  T extends {
    is_general?: boolean;
    last_message_at?: string | null;
    updated_at?: string | null;
  }
>(groups: T[]) {
  return [...groups].sort((left, right) => {
    const leftTimestamp = new Date(
      left.last_message_at || left.updated_at || 0
    ).getTime();
    const rightTimestamp = new Date(
      right.last_message_at || right.updated_at || 0
    ).getTime();

    if (leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    if (Boolean(left.is_general) !== Boolean(right.is_general)) {
      return left.is_general ? -1 : 1;
    }

    return 0;
  });
}
