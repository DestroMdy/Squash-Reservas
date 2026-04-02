"use client";

import { normalizeSquoreMqttMatch } from "@/lib/live-score";
import { LiveCourtId, LiveCourtState, LiveScoreboard } from "@/types/db";

type RealtimeCallback = (courtId: LiveCourtId, scoreboard: LiveScoreboard) => void;

type TopicCourtMap = Map<string, LiveCourtId>;

function normalizeTopic(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getBrokerUrl(court: LiveCourtState) {
  return court.stream?.squore_mqtt_broker_url?.trim() || null;
}

function getCourtTopics(court: LiveCourtState) {
  return [
    normalizeTopic(court.stream?.squore_mqtt_match_topic),
    normalizeTopic(court.stream?.squore_mqtt_change_topic)
  ].filter(Boolean) as string[];
}

function buildBrokerTopicMap(courts: LiveCourtState[]) {
  const brokerTopicMap = new Map<string, TopicCourtMap>();

  for (const court of courts) {
    const brokerUrl = getBrokerUrl(court);
    if (!brokerUrl) {
      continue;
    }

    const topics = getCourtTopics(court);
    if (!topics.length) {
      continue;
    }

    const topicCourtMap = brokerTopicMap.get(brokerUrl) || new Map<string, LiveCourtId>();
    for (const topic of topics) {
      topicCourtMap.set(topic, court.id);
    }
    brokerTopicMap.set(brokerUrl, topicCourtMap);
  }

  return brokerTopicMap;
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

    const topics = [...topicCourtMap.keys()];

    const handleConnect = () => {
      if (topics.length) {
        client.subscribe(topics);
      }
    };

    const handleMessage = (topic: string, payload: Uint8Array) => {
      const courtId = topicCourtMap.get(topic);
      if (!courtId) {
        return;
      }

      const scoreboard = parseMqttScoreboard(payload);
      if (!scoreboard) {
        return;
      }

      onRealtimeScoreboard(courtId, scoreboard);
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
