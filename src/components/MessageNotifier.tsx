"use client";

import { useEffect, useState } from "react";
import { getPushStatusFlag, PUSH_STATUS_EVENT } from "@/lib/push-client";
import {
  fetchLatestUnreadGroupMessage,
  fetchLatestUnreadIncomingMessage,
  getSession,
  getUser
} from "@/lib/supabase";

const LAST_MESSAGE_KEY = "sr_last_incoming_message_id";
const LAST_GROUP_MESSAGE_KEY = "sr_last_group_message_id";

export function MessageNotifier() {
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

      const user = await getUser(token);
      if (!user || cancelled) {
        return;
      }
      const userId = user.id;

      async function checkMessages() {
        const currentToken = getSession()?.access_token;
        if (!currentToken) {
          return;
        }

        try {
          const [latestDirect, latestGroup] = await Promise.all([
            fetchLatestUnreadIncomingMessage(userId, currentToken),
            fetchLatestUnreadGroupMessage(currentToken)
          ]);

          if (cancelled) {
            return;
          }

          if (latestDirect?.id) {
            const lastSeenDirect = window.localStorage.getItem(LAST_MESSAGE_KEY);
            if (!lastSeenDirect) {
              window.localStorage.setItem(LAST_MESSAGE_KEY, latestDirect.id);
            } else if (lastSeenDirect !== latestDirect.id) {
              window.localStorage.setItem(LAST_MESSAGE_KEY, latestDirect.id);

              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Nuevo mensaje privado", {
                  body: "Tienes un mensaje nuevo en Squash Reservas.",
                  icon: "/icon-192.png",
                  badge: "/icon-192.png",
                  tag: `message-${latestDirect.id}`
                });
              }
            }
          }

          if (latestGroup?.last_message_id) {
            const lastSeenGroup = window.localStorage.getItem(LAST_GROUP_MESSAGE_KEY);
            if (!lastSeenGroup) {
              window.localStorage.setItem(
                LAST_GROUP_MESSAGE_KEY,
                latestGroup.last_message_id
              );
            } else if (lastSeenGroup !== latestGroup.last_message_id) {
              window.localStorage.setItem(
                LAST_GROUP_MESSAGE_KEY,
                latestGroup.last_message_id
              );

              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`Nuevo mensaje en ${latestGroup.name}`, {
                  body:
                    latestGroup.last_message_sender_name && latestGroup.last_message_body
                      ? `${latestGroup.last_message_sender_name}: ${latestGroup.last_message_body}`
                      : "Tienes un mensaje nuevo en un grupo privado.",
                  icon: "/icon-192.png",
                  badge: "/icon-192.png",
                  tag: `group-message-${latestGroup.last_message_id}`
                });
              }
            }
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
  }, [pushEnabled]);

  return null;
}
