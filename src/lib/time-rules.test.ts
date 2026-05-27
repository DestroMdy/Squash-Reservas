import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduleDayOverride } from "@/types/db";
import {
  canBookSlot,
  canCancelBooking,
  canReserveSlot,
  isPastSlot,
  isSlotWithinClubHours
} from "@/lib/time-rules";

describe("time-rules", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("habilita reservas desde las 22:00 del día anterior", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T01:00:00Z"));

    expect(canBookSlot("2026-03-21")).toBe(true);
    expect(canBookSlot("2026-03-22")).toBe(false);
  });

  it("permite a admins saltear la apertura general de las 22:00", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T01:00:00Z"));

    expect(
      canBookSlot("2026-03-22", { bypassOpeningWindow: true })
    ).toBe(true);
    expect(
      canReserveSlot("2026-03-22", "20:00:00", "21:00:00", {
        bypassOpeningWindow: true
      })
    ).toBe(true);
  });

  it("permite cancelar hasta el momento de inicio del turno", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T22:59:59Z"));

    expect(canCancelBooking("2026-03-20", "20:00:00")).toBe(true);

    vi.setSystemTime(new Date("2026-03-20T23:00:01Z"));
    expect(canCancelBooking("2026-03-20", "20:00:00")).toBe(false);
  });

  it("detecta turnos vencidos y evita reservarlos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-21T00:05:00Z"));

    expect(isPastSlot("2026-03-20", "21:00:00")).toBe(true);
    expect(canReserveSlot("2026-03-20", "20:00:00", "21:00:00")).toBe(false);
  });

  it("restringe los sábados al rango 09:00-21:00", () => {
    expect(isSlotWithinClubHours("2026-03-21", "09:00:00", "10:00:00")).toBe(true);
    expect(isSlotWithinClubHours("2026-03-21", "20:00:00", "21:00:00")).toBe(true);
    expect(isSlotWithinClubHours("2026-03-21", "08:00:00", "09:00:00")).toBe(false);
    expect(isSlotWithinClubHours("2026-03-21", "21:00:00", "22:00:00")).toBe(false);
  });

  it("permite cerrar un día completo por excepción", () => {
    const override: ScheduleDayOverride = {
      slot_date: "2026-03-24",
      mode: "closed",
      opens_at: null,
      closes_at: null,
      note: "Cerrado por mantenimiento",
      updated_at: "2026-03-20T10:00:00.000Z",
      updated_by: "admin"
    };

    expect(
      isSlotWithinClubHours("2026-03-24", "18:00:00", "19:00:00", override)
    ).toBe(false);
  });

  it("respeta un horario especial por día", () => {
    const override: ScheduleDayOverride = {
      slot_date: "2026-03-24",
      mode: "custom_hours",
      opens_at: "10:00:00",
      closes_at: "18:00:00",
      note: "Horario especial",
      updated_at: "2026-03-20T10:00:00.000Z",
      updated_by: "admin"
    };

    expect(
      isSlotWithinClubHours("2026-03-24", "10:00:00", "11:00:00", override)
    ).toBe(true);
    expect(
      isSlotWithinClubHours("2026-03-24", "09:00:00", "10:00:00", override)
    ).toBe(false);
    expect(
      isSlotWithinClubHours("2026-03-24", "18:00:00", "19:00:00", override)
    ).toBe(false);
  });
});
