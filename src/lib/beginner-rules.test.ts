import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBeginnerRulesAcknowledgedAt,
  getBeginnerRulesAcknowledgedAt,
  setBeginnerRulesAcknowledgedAt
} from "@/lib/beginner-rules-store";
import {
  acknowledgeBeginnerRules,
  getBeginnerRulesStatus
} from "@/lib/beginner-rules";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/beginner-rules-store", () => ({
  getBeginnerRulesAcknowledgedAt: vi.fn(),
  setBeginnerRulesAcknowledgedAt: vi.fn(),
  clearBeginnerRulesAcknowledgedAt: vi.fn()
}));

describe("beginner-rules", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("obliga a mostrar las reglas si un admin vuelve a Principiante despues de salir", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ category: "Segunda", role: "admin" }]
    } as Response);

    vi.mocked(getBeginnerRulesAcknowledgedAt).mockResolvedValue("2026-03-23T00:00:00.000Z");

    const nonBeginnerStatus = await getBeginnerRulesStatus(
      "https://example.supabase.co",
      "service-role",
      "admin-1"
    );

    expect(nonBeginnerStatus.required).toBe(false);
    expect(clearBeginnerRulesAcknowledgedAt).toHaveBeenCalledWith("admin-1");

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ category: "Principiante", role: "admin" }]
    } as Response);

    vi.mocked(getBeginnerRulesAcknowledgedAt).mockResolvedValue(null);

    const beginnerStatus = await getBeginnerRulesStatus(
      "https://example.supabase.co",
      "service-role",
      "admin-1"
    );

    expect(beginnerStatus.required).toBe(true);
  });

  it("no vuelve a abrir el gate mientras el admin sigue en Principiante despues de leerlo", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ category: "Principiante", role: "admin" }]
    } as Response);

    vi.mocked(setBeginnerRulesAcknowledgedAt).mockResolvedValue("2026-03-23T00:00:00.000Z");

    const acknowledgement = await acknowledgeBeginnerRules(
      "https://example.supabase.co",
      "service-role",
      "admin-1"
    );

    expect(acknowledgement.required).toBe(false);
    expect(acknowledgement.alwaysShow).toBe(false);

    vi.mocked(getBeginnerRulesAcknowledgedAt).mockResolvedValue("2026-03-23T00:00:00.000Z");

    const status = await getBeginnerRulesStatus(
      "https://example.supabase.co",
      "service-role",
      "admin-1"
    );

    expect(status.required).toBe(false);
    expect(clearBeginnerRulesAcknowledgedAt).not.toHaveBeenCalled();
  });
});
