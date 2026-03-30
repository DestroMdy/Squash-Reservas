export const GENERAL_MESSAGE_GROUP_NAME = "Grupo general";

export function isGeneralMessageGroupName(name?: string | null) {
  return (name || "").trim().toLowerCase() === GENERAL_MESSAGE_GROUP_NAME.toLowerCase();
}

export function sortPrivateMessageGroups<
  T extends {
    is_general?: boolean;
    updated_at?: string | null;
  }
>(groups: T[]) {
  return [...groups].sort((left, right) => {
    if (Boolean(left.is_general) !== Boolean(right.is_general)) {
      return left.is_general ? -1 : 1;
    }

    return (
      new Date(right.updated_at || 0).getTime() -
      new Date(left.updated_at || 0).getTime()
    );
  });
}
