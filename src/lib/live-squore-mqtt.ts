"use client";

import { normalizeSquoreMqttMatch } from "@/lib/live-score";
import { LiveCourtId, LiveCourtState, LiveScoreboard } from "@/types/db";

type RealtimeCallback = (courtId: LiveCourtId, scoreboard: LiveScoreboard) => void;

type TopicSubscription = {
  filter: string;
  courtId: LiveCourtId;
};

type BrokerSubscriptionsMap = Map<string, TopicSubscription[]>;

function normalizeTopic(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getBrokerUrl(court: LiveCourtState) {
  return court.stream?.squore_mqtt_broker_url?.trim() || null;
}

export function toMqttSubscriptionFilter(court: LiveCourtState, topic: string) {
  const deviceId = court.stream?.squore_device_id?.trim() || "+";

  return topic
    .replace(/\$\{DeviceId\}/g, deviceId)
    .replace(/\$\{[^}]+\}/g, "+")
    .replace(/\/{2,}/g, "/");
}

function getCourtTopics(court: LiveCourtState) {
  return [
    normalizeTopic(court.stream?.squore_mqtt_match_topic),
    normalizeTopic(court.stream?.squore_mqtt_change_topic)
  ]
    .filter(Boolean)
    .map((topic) => toMqttSubscriptionFilter(court, topic as string));
}

function buildBrokerTopicMap(courts: LiveCourtState[]) {
  const brokerTopicMap: BrokerSubscriptionsMap = new Map();

  for (const court of courts) {
    const brokerUrl = getBrokerUrl(court);
    if (!brokerUrl) {
      continue;
    }

    const topics = getCourtTopics(court);
    if (!topics.length) {
      continue;
    }

    const subscriptions = brokerTopicMap.get(brokerUrl) || [];
    for (const filter of topics) {
      if (!subscriptions.some((subscription) => subscription.filter === filter && subscription.courtId === court.id)) {
        subscriptions.push({ filter, courtId: court.id });
      }
    }
    brokerTopicMap.set(brokerUrl, subscriptions);
  }

  return brokerTopicMap;
}

export function matchesMqttTopicFilter(filter: string, topic: string) {
  if (filter === topic) {
    return true;
  }

  const filterParts = filter.split("/");
  const topicParts = topic.split("/");

  for (let index = 0; index < filterParts.length; index += 1) {
    const filterPart = filterParts[index];
    const topicPart = topicParts[index];

    if (filterPart === "#") {
      return true;
    }

    if (topicPart === undefined) {
      return false;
    }

    if (filterPart === "+") {
      continue;
    }

    if (filterPart !== topicPart) {
      return false;
    }
  }

  return filterParts.length === topicParts.length;
}

function parseMqttScoreboard(rawPayload: Uint8Array | Buffer | string) {
  const text =
    typeof rawPayload === "string"
      ? rawPayload
      : new TextDecoder().decode(rawPayload);

  if (!text.trim()) {
    return null;
  }

  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return normalizeSquoreMqttMatch(payload);
  } catch {
    return null;
  }
}

export async function startSquoreMqttLiveSync(
  courts: LiveCourtState[],
  onRealtimeScoreboard: RealtimeCallback
) {
  const brokerTopicMap = buildBrokerTopicMap(courts);

  if (!brokerTopicMap.size) {
    return () => undefined;
  }

  const { connect } = await import("mqtt");
  const disposers: Array<() => void> = [];

  for (const [brokerUrl, topicCourtMap] of brokerTopicMap) {
    const client = connect(brokerUrl, {
      reconnectPeriod: 3000,
      connectTimeout: 8000,
      keepalive: 30
    });

    const topics = [...new Set(topicCourtMap.map((subscription) => subscription.filter))];

    const handleConnect = () => {
      if (topics.length) {
        client.subscribe(topics);
      }
    };

    const handleMessage = (topic: string, payload: Uint8Array) => {
      const subscription = topicCourtMap.find((entry) =>
        matchesMqttTopicFilter(entry.filter, topic)
      );
      if (!subscription) {
        return;
      }

      const scoreboard = parseMqttScoreboard(payload);
      if (!scoreboard) {
        return;
      }

      onRealtimeScoreboard(subscription.courtId, scoreboard);
    };

    client.on("connect", handleConnect);
    client.on("message", handleMessage);

    disposers.push(() => {
      client.off("connect", handleConnect);
      client.off("message", handleMessage);
      client.end(true);
    });
  }

  return () => {
    for (const dispose of disposers) {
      dispose();
    }
  };
}
