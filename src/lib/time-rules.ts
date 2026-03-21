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

export function isSlotWithinClubHours(slotDate: string, startTime: string, endTime: string) {
  const weekday = getWeekday(slotDate);

  if (weekday === 6) {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);

    return startMinutes >= 9 * 60 && endMinutes <= 21 * 60;
  }

  return true;
}
