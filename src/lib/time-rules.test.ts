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
    vi.setSystemTime(new Date(2026, 2, 20, 22, 0, 0));

    expect(canBookSlot("2026-03-21")).toBe(true);
    expect(canBookSlot("2026-03-22")).toBe(false);
  });

  it("permite cancelar solo con más de una hora de anticipación", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 18, 59, 59));

    expect(canCancelBooking("2026-03-20", "20:00:00")).toBe(true);

    vi.setSystemTime(new Date(2026, 2, 20, 19, 0, 1));
    expect(canCancelBooking("2026-03-20", "20:00:00")).toBe(false);
  });

  it("detecta turnos vencidos y evita reservarlos", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 20, 21, 5, 0));

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
