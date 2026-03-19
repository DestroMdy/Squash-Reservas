"use client";

import { useEffect } from "react";
import {
  fetchLatestUnreadIncomingMessage,
  getSession,
  getUser
} from "@/lib/supabase";

const LAST_MESSAGE_KEY = "sr_last_incoming_message_id";

export function MessageNotifier() {
  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    async function init() {
      const session = getSession();
      const token = session?.access_token;

      if (!token) {
        return;
      }

      const user = await getUser(token);
      if (!user || cancelled) {
        return;
      }
      const userId = user.id;

      if ("Notification" in window && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // Ignore permission errors.
        }
      }

      async function checkMessages() {
        const currentToken = getSession()?.access_token;
        if (!currentToken) {
          return;
        }

        try {
          const latest = await fetchLatestUnreadIncomingMessage(userId, currentToken);
          if (!latest?.id || cancelled) {
            return;
          }

          const lastSeen = window.localStorage.getItem(LAST_MESSAGE_KEY);
          if (!lastSeen) {
            window.localStorage.setItem(LAST_MESSAGE_KEY, latest.id);
            return;
          }

          if (lastSeen === latest.id) {
            return;
          }

          window.localStorage.setItem(LAST_MESSAGE_KEY, latest.id);

          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Nuevo mensaje privado", {
              body: "Tienes un mensaje nuevo en Squash Reservas.",
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: `message-${latest.id}`
            });
          }
        } catch {
          // Keep polling on transient failures.
        }
      }

      await checkMessages();

      intervalId = window.setInterval(() => {
        void checkMessages();
      }, 30000);
    }

    void init();

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
