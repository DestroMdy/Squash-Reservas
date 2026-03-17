export function canBookSlot(slotDate: string): boolean {
  const now = new Date();

  // fecha del turno
  const slot = new Date(slotDate);

  // día anterior a las 22:00
  const openTime = new Date(slot);
  openTime.setDate(openTime.getDate() - 1);
  openTime.setHours(22, 0, 0, 0);

  return now >= openTime;
}