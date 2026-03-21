import { describe, expect, it, vi, afterEach } from "vitest";
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
});
