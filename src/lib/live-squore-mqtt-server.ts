import "server-only";

import { connect } from "mqtt";

import { normalizeSquoreMqttMatch } from "@/lib/live-score";
import { LiveScoreboard, LiveStreamConfig } from "@/types/db";

type MqttEnabledStream = Pick<
  LiveStreamConfig,
  | "squore_device_id"
  | "squore_mqtt_broker_url"
  | "squore_mqtt_match_topic"
  | "squore_mqtt_change_topic"
>;

function normalizeTopic(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toMqttSubscriptionFilter(stream: MqttEnabledStream, topic: string) {
  const deviceId = stream.squore_device_id?.trim() || "+";

  return topic
    .replace(/\$\{DeviceId\}/g, deviceId)
    .replace(/\$\((DeviceId)\)/g, deviceId)
    .replace(/\$\{[^}]+\}/g, "+")
    .replace(/\$\([^)]+\)/g, "+")
    .replace(/\/{2,}/g, "/");
}

function getTopics(stream: MqttEnabledStream) {
  return [
    normalizeTopic(stream.squore_mqtt_match_topic),
    normalizeTopic(stream.squore_mqtt_change_topic)
  ]
    .filter(Boolean)
    .map((topic) => toMqttSubscriptionFilter(stream, topic as string));
}

export async function fetchSquoreMqttSnapshot(
  stream: MqttEnabledStream,
  timeoutMs = 1200
) {
  const brokerUrl = stream.squore_mqtt_broker_url?.trim();
  const topics = getTopics(stream);

  if (!brokerUrl || !topics.length) {
    return null;
  }

  return await new Promise<LiveScoreboard | null>((resolve) => {
    const client = connect(brokerUrl, {
      reconnectPeriod: 0,
      connectTimeout: Math.min(timeoutMs, 8000),
      keepalive: 30
    });

    let settled = false;

    const finish = (value: LiveScoreboard | null) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      client.removeAllListeners();
      client.end(true);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    client.on("connect", () => {
      client.subscribe(topics, (error) => {
        if (error) {
          finish(null);
        }
      });
    });

    client.on("message", (_topic, payload) => {
      try {
        const text = payload.toString();
        if (!text.trim()) {
          return;
        }

        const parsed = JSON.parse(text) as Record<string, unknown>;
        const scoreboard = normalizeSquoreMqttMatch(parsed);

        if (scoreboard) {
          finish(scoreboard);
        }
      } catch {
        // Ignore malformed MQTT messages and keep waiting for a valid snapshot.
      }
    });

    client.on("error", () => finish(null));
    client.on("close", () => finish(null));
  });
}
