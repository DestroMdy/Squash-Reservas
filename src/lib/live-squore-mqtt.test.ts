import { describe, expect, it } from "vitest";

import { matchesMqttTopicFilter, toMqttSubscriptionFilter } from "@/lib/live-squore-mqtt";
import { LiveCourtState } from "@/types/db";

const court: LiveCourtState = {
  id: "court-1",
  label: "Cancha 1",
  stream: {
    title: "Cancha 1",
    description: null,
    banner_url: null,
    youtube_url: null,
    youtube_video_id: null,
    embed_url: null,
    squore_device_id: "XFQE3A",
    squore_mqtt_broker_url: "wss://broker.emqx.io:8084/mqtt",
    squore_mqtt_match_topic: "double-yellow/${FeedName}/${Brand}/${DeviceId}/match",
    squore_mqtt_change_topic: "double-yellow/${Brand}/${DeviceId}/change",
    scoreboard_delay_seconds: 5,
    is_enabled: true,
    is_live: true,
    starts_at: null,
    updated_at: null,
    updated_by: null
  },
  scoreboard: null,
  comments: []
};

describe("live-squore-mqtt", () => {
  it("converts Squore placeholders into MQTT subscription filters", () => {
    expect(
      toMqttSubscriptionFilter(court, "double-yellow/${FeedName}/${Brand}/${DeviceId}/match")
    ).toBe("double-yellow/+/+/XFQE3A/match");

    expect(
      toMqttSubscriptionFilter(court, "double-yellow/${Brand}/${DeviceId}/change")
    ).toBe("double-yellow/+/XFQE3A/change");
  });

  it("matches MQTT topics against wildcard filters", () => {
    expect(
      matchesMqttTopicFilter(
        "double-yellow/+/+/XFQE3A/match",
        "double-yellow/III fecha Circuito Patagonico/Squore/XFQE3A/match"
      )
    ).toBe(true);

    expect(
      matchesMqttTopicFilter(
        "double-yellow/+/XFQE3A/change",
        "double-yellow/Squore/XFQE3A/change"
      )
    ).toBe(true);

    expect(
      matchesMqttTopicFilter(
        "double-yellow/+/XFQE3A/change",
        "double-yellow/Squore/OTRO123/change"
      )
    ).toBe(false);
  });
});
