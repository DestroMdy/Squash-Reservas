import { describe, expect, it } from "vitest";
import {
  isWhatsAppPhoneValid,
  normalizeWhatsAppPhone
} from "@/lib/whatsapp-utils";

describe("whatsapp-utils", () => {
  it("normaliza un celular argentino local", () => {
    expect(normalizeWhatsAppPhone("2804123456")).toBe("+5492804123456");
  });

  it("normaliza un celular argentino con prefijo 15", () => {
    expect(normalizeWhatsAppPhone("280154123456")).toBe("+5492804123456");
  });

  it("normaliza un celular argentino con codigo pais sin 9", () => {
    expect(normalizeWhatsAppPhone("542804123456")).toBe("+5492804123456");
  });

  it("respeta numeros internacionales completos", () => {
    expect(normalizeWhatsAppPhone("+14155552671")).toBe("+14155552671");
  });

  it("marca como invalido un numero demasiado corto", () => {
    expect(isWhatsAppPhoneValid("12345")).toBe(false);
  });
});

