"use client";

import { useEffect, useState } from "react";
import { getPushStatusFlag, PUSH_STATUS_EVENT } from "@/lib/push-client";
import {
  fetchLatestConfirmedBooking,
  fetchProfileRole,
  getSession,
  getUser
} from "@/lib/supabase";

const LAST_BOOKING_KEY = "sr_last_admin_booking_id";
const ADMIN_BOOKING_NOTIFIER_INTERVAL_MS = 60000;

export function AdminBookingNotifier() {
  const [pushEnabled, setPushEnabled] = useState(false);

  useEffect(() => {
    const syncPushStatus = () => {
      setPushEnabled(getPushStatusFlag());
    };

    syncPushStatus();
    window.addEventListener(PUSH_STATUS_EVENT, syncPushStatus);

    return () => {
      window.removeEventListener(PUSH_STATUS_EVENT, syncPushStatus);
    };
  }, []);

  useEffect(() => {
    if (pushEnabled) {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    async function init() {
      const session = getSession();
      const token = session?.access_token;

      if (!token) {
        return;
      }

      const user = session.user?.id ? session.user : await getUser(token);
      if (!user || cancelled) {
        return;
      }

      const role = await fetchProfileRole(user.id, token);
      if (role !== "admin" || cancelled) {
        return;
      }

      async function checkBookings() {
        if (document.visibilityState !== "visible") {
          return;
        }

        const currentSession = getSession();
        const currentToken = currentSession?.access_token;

        if (!currentToken) {
          return;
        }

        try {
          const latest = await fetchLatestConfirmedBooking(currentToken);
          if (!latest?.id || cancelled) {
            return;
          }

          const lastSeen = window.localStorage.getItem(LAST_BOOKING_KEY);
          if (!lastSeen) {
            window.localStorage.setItem(LAST_BOOKING_KEY, latest.id);
            return;
          }

          if (lastSeen === latest.id) {
            return;
          }

          window.localStorage.setItem(LAST_BOOKING_KEY, latest.id);

          if ("Notification" in window && Notification.permission === "granted") {
            const courtName = latest.courts?.name ?? "Cancha";
            const slotDate = latest.time_slots?.slot_date ?? "fecha";
            const startTime = latest.time_slots?.start_time?.slice(0, 5) ?? "";

            new Notification("Nueva reserva", {
              body: `${courtName} · ${slotDate} ${startTime}`.trim(),
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: `booking-${latest.id}`,
            });
          }
        } catch {
          // Keep polling even if one request fails.
        }
      }

      await checkBookings();

      intervalId = window.setInterval(() => {
        void checkBookings();
      }, ADMIN_BOOKING_NOTIFIER_INTERVAL_MS);
    }

    void init();

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [pushEnabled]);

  return null;
}
