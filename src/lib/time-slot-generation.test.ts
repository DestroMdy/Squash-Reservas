import { describe, expect, it } from "vitest";
import {
  buildMissingTimeSlotsForDate,
  getDefaultSlotTimesForDate
} from "@/lib/time-slot-generation";

describe("time-slot-generation", () => {
  it("genera horarios completos de lunes a viernes", () => {
    const slots = getDefaultSlotTimesForDate("2026-04-16");

    expect(slots).toHaveLength(16);
    expect(slots[0]).toEqual({
      start_time: "07:00:00",
      end_time: "08:00:00"
    });
    expect(slots.at(-1)).toEqual({
      start_time: "22:00:00",
      end_time: "23:00:00"
    });
  });

  it("genera horarios de sabado desde las 08:00", () => {
    const slots = getDefaultSlotTimesForDate("2026-04-11");

    expect(slots).toHaveLength(15);
    expect(slots[0]).toEqual({
      start_time: "08:00:00",
      end_time: "09:00:00"
    });
    expect(slots.at(-1)).toEqual({
      start_time: "22:00:00",
      end_time: "23:00:00"
    });
  });

  it("no genera horarios los domingos", () => {
    expect(getDefaultSlotTimesForDate("2026-04-12")).toEqual([]);
  });

  it("solo construye los horarios faltantes para cada cancha", () => {
    const slots = buildMissingTimeSlotsForDate(
      "2026-04-16",
      ["court-1", "court-2"],
      [
        {
          court_id: "court-1",
          start_time: "07:00:00",
          end_time: "08:00:00"
        },
        {
          court_id: "court-2",
          start_time: "07:00:00",
          end_time: "08:00:00"
        },
        {
          court_id: "court-1",
          start_time: "08:00:00",
          end_time: "09:00:00"
        }
      ]
    );

    expect(slots).toHaveLength(29);
    expect(slots.some((slot) => slot.court_id === "court-1" && slot.start_time === "07:00:00")).toBe(false);
    expect(slots.some((slot) => slot.court_id === "court-2" && slot.start_time === "07:00:00")).toBe(false);
    expect(slots.some((slot) => slot.court_id === "court-2" && slot.start_time === "08:00:00")).toBe(true);
  });
});
