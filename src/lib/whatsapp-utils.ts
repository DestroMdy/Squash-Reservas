const ARGENTINA_COUNTRY_CODE = "54";
const ARGENTINA_MOBILE_PREFIX = "9";

function stripNonDigits(value: string) {
  return value.replace(/\D/g, "");
}

function stripArgentinaMobileHint(digits: string) {
  let normalized = digits.replace(/^0+/, "");

  for (const index of [2, 3, 4]) {
    if (
      normalized.length >= 12 &&
      normalized.slice(index, index + 2) === "15"
    ) {
      normalized =
        normalized.slice(0, index) + normalized.slice(index + 2);
      break;
    }
  }

  return normalized;
}

function isValidArgentinaNationalNumber(digits: string) {
  return digits.length >= 10 && digits.length <= 11;
}

function normalizeInternationalDigits(digits: string) {
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return `+${digits}`;
}

export function normalizeWhatsAppPhone(phone: string | null | undefined) {
  const rawValue = phone?.trim();

  if (!rawValue) {
    return null;
  }

  if (rawValue.startsWith("+")) {
    return normalizeInternationalDigits(stripNonDigits(rawValue));
  }

  let digits = stripNonDigits(rawValue);

  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return normalizeInternationalDigits(digits);
  }

  if (digits.startsWith(`${ARGENTINA_COUNTRY_CODE}${ARGENTINA_MOBILE_PREFIX}`)) {
    return normalizeInternationalDigits(digits);
  }

  if (digits.startsWith(ARGENTINA_COUNTRY_CODE)) {
    const nationalNumber = stripArgentinaMobileHint(digits.slice(2));

    if (!isValidArgentinaNationalNumber(nationalNumber)) {
      return null;
    }

    const mobileNumber = nationalNumber.startsWith(ARGENTINA_MOBILE_PREFIX)
      ? nationalNumber
      : `${ARGENTINA_MOBILE_PREFIX}${nationalNumber}`;

    return normalizeInternationalDigits(
      `${ARGENTINA_COUNTRY_CODE}${mobileNumber}`
    );
  }

  const nationalNumber = stripArgentinaMobileHint(digits);

  if (!isValidArgentinaNationalNumber(nationalNumber)) {
    return null;
  }

  return normalizeInternationalDigits(
    `${ARGENTINA_COUNTRY_CODE}${ARGENTINA_MOBILE_PREFIX}${nationalNumber}`
  );
}

export function isWhatsAppPhoneValid(phone: string | null | undefined) {
  return Boolean(normalizeWhatsAppPhone(phone));
}
