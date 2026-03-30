import type { BookingAvailabilitySettings } from "@/types/db";

const DEFAULT_NOTE =
  "Las reservas están temporalmente deshabilitadas mientras abrimos los registros. Pronto las volveremos a habilitar.";

export function getDefaultBookingAvailabilitySettings(): BookingAvailabilitySettings {
  return {
    reservations_enabled: true,
    note: null,
    updated_at: new Date().toISOString(),
    updated_by: null
  };
}

export function normalizeBookingAvailabilitySettings(
  value: Partial<BookingAvailabilitySettings> | null | undefined
): BookingAvailabilitySettings {
  const defaults = getDefaultBookingAvailabilitySettings();

  return {
    reservations_enabled: value?.reservations_enabled !== false,
    note:
      typeof value?.note === "string" && value.note.trim()
        ? value.note.trim()
        : null,
    updated_at:
      typeof value?.updated_at === "string" && value.updated_at.trim()
        ? value.updated_at
        : defaults.updated_at,
    updated_by:
      typeof value?.updated_by === "string" && value.updated_by.trim()
        ? value.updated_by
        : null
  };
}

export function getReservationsPausedMessage(note?: string | null) {
  const trimmed = typeof note === "string" ? note.trim() : "";

  return trimmed
    ? `Las reservas están temporalmente deshabilitadas por administración. ${trimmed}`
    : DEFAULT_NOTE;
}

export function areReservationsEnabled(
  settings?: Pick<BookingAvailabilitySettings, "reservations_enabled"> | null
) {
  return settings?.reservations_enabled !== false;
}
