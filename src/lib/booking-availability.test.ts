import { describe, expect, it } from "vitest";
import {
  areReservationsEnabled,
  getReservationsPausedMessage,
  normalizeBookingAvailabilitySettings
} from "@/lib/booking-availability";

describe("booking-availability", () => {
  it("normaliza la configuración y recorta la nota", () => {
    const settings = normalizeBookingAvailabilitySettings({
      reservations_enabled: false,
      note: "  Lanzamiento en curso.  ",
      updated_at: "2026-03-30T00:00:00.000Z",
      updated_by: "admin-1"
    });

    expect(settings.reservations_enabled).toBe(false);
    expect(settings.note).toBe("Lanzamiento en curso.");
    expect(settings.updated_by).toBe("admin-1");
  });

  it("devuelve un mensaje útil cuando no hay nota personalizada", () => {
    expect(getReservationsPausedMessage(null)).toContain(
      "reservas están temporalmente deshabilitadas"
    );
  });

  it("interpreta el estado global de reservas", () => {
    expect(areReservationsEnabled({ reservations_enabled: true })).toBe(true);
    expect(areReservationsEnabled({ reservations_enabled: false })).toBe(false);
    expect(areReservationsEnabled(null)).toBe(true);
  });
});
