import { describe, expect, it } from "vitest";
import { decodeUserCookie, encodeUserCookie } from "@/lib/session-cookies";

describe("session-cookies", () => {
  it("decodes a value encoded once", () => {
    const encoded = encodeUserCookie({
      id: "user-1",
      email: "user@example.com"
    });

    expect(decodeUserCookie(encoded)).toEqual({
      id: "user-1",
      email: "user@example.com"
    });
  });

  it("decodes a value encoded twice", () => {
    const encodedTwice = encodeURIComponent(
      encodeUserCookie({
        id: "user-2",
        email: "user2@example.com"
      })
    );

    expect(decodeUserCookie(encodedTwice)).toEqual({
      id: "user-2",
      email: "user2@example.com"
    });
  });
});
