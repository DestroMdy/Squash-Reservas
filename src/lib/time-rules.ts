function buildSlotDateTime(slotDate: string, time: string) {
  return new Date(`${slotDate}T${time}`);
}

function getWeekday(slotDate: string) {
  return new Date(`${slotDate}T12:00:00`).getDay();
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function canBookSlot(slotDate: string): boolean {
  const now = new Date();
  const slot = new Date(slotDate);
  const openTime = new Date(slot);

  openTime.setDate(openTime.getDate() - 1);
  openTime.setHours(22, 0, 0, 0);

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
