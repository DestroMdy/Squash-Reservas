import type { ScheduleDayOverride } from "@/types/db";

function buildLocalDate(slotDate: string, hours = 0, minutes = 0, seconds = 0) {
  const [year, month, day] = slotDate.split("-").map(Number);
  return new Date(year, month - 1, day, hours, minutes, seconds, 0);
}

function buildSlotDateTime(slotDate: string, time: string) {
  const [hours, minutes, seconds] = time.split(":").map(Number);
  return buildLocalDate(slotDate, hours || 0, minutes || 0, seconds || 0);
}

function getWeekday(slotDate: string) {
  return buildLocalDate(slotDate, 12).getDay();
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinCustomScheduleHours(
  startTime: string,
  endTime: string,
  scheduleOverride: ScheduleDayOverride
) {
  const opensAt = scheduleOverride.opens_at;
  const closesAt = scheduleOverride.closes_at;

  if (!opensAt || !closesAt) {
    return false;
  }

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const opensAtMinutes = timeToMinutes(opensAt);
  const closesAtMinutes = timeToMinutes(closesAt);

  return startMinutes >= opensAtMinutes && endMinutes <= closesAtMinutes;
}

export function canBookSlot(slotDate: string): boolean {
  const now = new Date();
  const openTime = buildLocalDate(slotDate, 22);

  openTime.setDate(openTime.getDate() - 1);

  return now >= openTime;
}

export function isPastSlot(slotDate: string, endTime: string): boolean {
  return buildSlotDateTime(slotDate, endTime) < new Date();
}

export function canReserveSlot(slotDate: string, startTime: string, endTime: string) {
  return canBookSlot(slotDate) && !isPastSlot(slotDate, endTime) && Boolean(startTime);
}

export function canCancelBooking(slotDate: string, startTime: string) {
  const bookingStart = buildSlotDateTime(slotDate, startTime);
  const minimumCancelTime = new Date(bookingStart.getTime() - 60 * 60 * 1000);
  return new Date() <= minimumCancelTime;
}

export function isSlotWithinClubHours(
  slotDate: string,
  startTime: string,
  endTime: string,
  scheduleOverride?: ScheduleDayOverride | null
) {
  if (scheduleOverride?.slot_date === slotDate) {
    if (scheduleOverride.mode === "closed") {
      return false;
    }

    if (scheduleOverride.mode === "custom_hours") {
      return isWithinCustomScheduleHours(startTime, endTime, scheduleOverride);
    }
  }

  const weekday = getWeekday(slotDate);

  if (weekday === 6) {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    return startMinutes >= 9 * 60 && endMinutes <= 21 * 60;
  }

  return true;
}
