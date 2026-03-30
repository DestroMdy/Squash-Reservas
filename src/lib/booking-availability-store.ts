import "server-only";

import { getJsonKv, isKvConfigured, setJsonKv } from "@/lib/app-kv";
import {
  getDefaultBookingAvailabilitySettings,
  normalizeBookingAvailabilitySettings
} from "@/lib/booking-availability";
import type { BookingAvailabilitySettings } from "@/types/db";

const BOOKING_AVAILABILITY_KV_KEY = "sr:booking-availability";

export function isBookingAvailabilityStoreConfigured() {
  return isKvConfigured();
}

export async function getStoredBookingAvailabilitySettings() {
  if (!isBookingAvailabilityStoreConfigured()) {
    return getDefaultBookingAvailabilitySettings();
  }

  const raw =
    await getJsonKv<Partial<BookingAvailabilitySettings>>(BOOKING_AVAILABILITY_KV_KEY);

  return normalizeBookingAvailabilitySettings(raw);
}

export async function setStoredBookingAvailabilitySettings(
  value: Partial<BookingAvailabilitySettings> & {
    reservations_enabled: boolean;
  }
) {
  if (!isBookingAvailabilityStoreConfigured()) {
    throw new Error("La configuración global de reservas no está disponible.");
  }

  const normalized = normalizeBookingAvailabilitySettings({
    ...value,
    updated_at: value.updated_at || new Date().toISOString()
  });

  await setJsonKv(BOOKING_AVAILABILITY_KV_KEY, normalized);
  return normalized;
}
