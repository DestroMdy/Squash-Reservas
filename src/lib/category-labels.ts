export const BEGINNER_CATEGORY_VALUE = "Principiante";
export const BEGINNER_CATEGORY_LABEL = "Sexta/Principiantes";

export function normalizeCategoryKey(category: string | null | undefined) {
  const value = category?.trim();

  if (!value) {
    return "";
  }

  const normalized = value.toLowerCase();

  if (
    normalized === "principiante" ||
    normalized === "sexta/principiantes" ||
    normalized === "sexta / principiantes"
  ) {
    return BEGINNER_CATEGORY_VALUE;
  }

  return value;
}

export function formatCategoryLabel(category: string | null | undefined) {
  const normalized = normalizeCategoryKey(category);

  if (!normalized) {
    return "Sin categoría";
  }

  if (normalized === BEGINNER_CATEGORY_VALUE) {
    return BEGINNER_CATEGORY_LABEL;
  }

  return normalized;
}
