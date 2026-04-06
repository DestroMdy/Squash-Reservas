import "server-only";

import { normalizeWhatsAppPhone } from "@/lib/whatsapp-utils";

type TwilioWhatsAppConfig = {
  accountSid: string;
  authToken: string;
  from: string;
  templateSid?: string;
};

function normalizeWhatsAppAddress(value: string) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

function getTwilioWhatsAppConfig(): TwilioWhatsAppConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const templateSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID;

  if (!accountSid || !authToken || !from) {
    return null;
  }

  return {
    accountSid,
    authToken,
    from: normalizeWhatsAppAddress(from),
    ...(templateSid ? { templateSid } : {})
  };
}

export function isTwilioWhatsAppConfigured() {
  return Boolean(getTwilioWhatsAppConfig());
}

export async function sendWaitlistReleasedWhatsAppNotification({
  recipientPhone,
  recipientName,
  slotLabel,
  scheduleUrl
}: {
  recipientPhone: string;
  recipientName?: string | null;
  slotLabel: string;
  scheduleUrl: string;
}) {
  const config = getTwilioWhatsAppConfig();

  if (!config) {
    throw new Error("La configuracion de Twilio WhatsApp no esta disponible.");
  }

  const normalizedPhone = normalizeWhatsAppPhone(recipientPhone);

  if (!normalizedPhone) {
    throw new Error("El telefono del usuario no es valido para WhatsApp.");
  }

  const payload = new URLSearchParams();
  payload.set("From", config.from);
  payload.set("To", normalizeWhatsAppAddress(normalizedPhone));

  if (config.templateSid) {
    payload.set("ContentSid", config.templateSid);
    payload.set(
      "ContentVariables",
      JSON.stringify({
        "1": recipientName?.trim() || "Jugador",
        "2": slotLabel,
        "3": scheduleUrl
      })
    );
  } else {
    payload.set(
      "Body",
      `${recipientName?.trim() || "Jugador"}, se libero el turno ${slotLabel}. Entra a ${scheduleUrl} para intentar reservarlo.`
    );
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.accountSid}:${config.authToken}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload,
      cache: "no-store"
    }
  );

  if (response.ok) {
    return;
  }

  const text = await response.text();

  throw new Error(
    text || "No se pudo enviar el aviso por WhatsApp mediante Twilio."
  );
}

