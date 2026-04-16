import { adminHeaders } from "@/lib/server-auth";

type CourtRecord = {
  id?: string | null;
  is_active?: boolean | null;
};

type ExistingSlotRecord = {
  court_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type TimeSlotSeed = {
  court_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: "available";
  price: number;
};

const SLOT_HORIZON_DAYS = 21;

function padTimeValue(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0));
}

function formatDateKey(date: Date) {
  return [
    date.getUTCFullYear(),
    padTimeValue(date.getUTCMonth() + 1),
    padTimeValue(date.getUTCDate())
  ].join("-");
}

function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateKey(date);
}

function compareDateKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function todayArgentinaDateKey() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(new Date());
}

function getWeekday(dateKey: string) {
  return parseDateKey(dateKey).getUTCDay();
}

function buildHourlyRange(startHour: number, endHourExclusive: number) {
  const slots: Array<{ start_time: string; end_time: string }> = [];

  for (let hour = startHour; hour < endHourExclusive; hour += 1) {
    slots.push({
      start_time: `${padTimeValue(hour)}:00:00`,
      end_time: `${padTimeValue(hour + 1)}:00:00`
    });
  }

  return slots;
}

export function getDefaultSlotTimesForDate(dateKey: string) {
  const weekday = getWeekday(dateKey);

  if (weekday === 0) {
    return [] as Array<{ start_time: string; end_time: string }>;
  }

  if (weekday === 6) {
    return buildHourlyRange(8, 23);
  }

  return buildHourlyRange(7, 23);
}

export function buildMissingTimeSlotsForDate(
  dateKey: string,
  courtIds: string[],
  existingSlots: ExistingSlotRecord[] = []
) {
  const slotTimes = getDefaultSlotTimesForDate(dateKey);
  const existingKeys = new Set(
    existingSlots
      .filter(
        (slot): slot is Required<Pick<ExistingSlotRecord, "court_id" | "start_time" | "end_time">> =>
          Boolean(slot.court_id && slot.start_time && slot.end_time)
      )
      .map((slot) => `${slot.court_id}|${slot.start_time}|${slot.end_time}`)
  );

  return courtIds.flatMap((courtId) =>
    slotTimes
      .filter(
        (slot) => !existingKeys.has(`${courtId}|${slot.start_time}|${slot.end_time}`)
      )
      .map<TimeSlotSeed>((slot) => ({
        court_id: courtId,
        slot_date: dateKey,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status: "available",
        price: 0
      }))
  );
}

async function parseRestPayload<T>(response: Response, fallback: T) {
  if (response.status === 204) {
    return fallback;
  }

  const raw = await response.text();

  if (!raw.trim()) {
    return fallback;
  }

  return JSON.parse(raw) as T;
}

async function fetchActiveCourtIds(supabaseUrl: string, serviceRoleKey: string) {
  const response = await fetch(`${supabaseUrl}/rest/v1/courts?select=id,is_active`, {
    method: "GET",
    headers: adminHeaders(serviceRoleKey),
    cache: "no-store"
  });

  if (!response.ok) {
    return [] as string[];
  }

  const rows = await parseRestPayload<CourtRecord[]>(response, []);
  return rows
    .filter((court) => court.id && court.is_active !== false)
    .map((court) => court.id as string);
}

async function fetchLatestSlotDate(supabaseUrl: string, serviceRoleKey: string) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/time_slots?select=slot_date&order=slot_date.desc&limit=1`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return null;
  }

  const rows = await parseRestPayload<Array<{ slot_date?: string | null }>>(
    response,
    []
  );

  return rows[0]?.slot_date || null;
}

async function fetchExistingSlotsForDate(
  supabaseUrl: string,
  serviceRoleKey: string,
  dateKey: string
) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/time_slots?select=court_id,start_time,end_time&slot_date=eq.${dateKey}`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return [] as ExistingSlotRecord[];
  }

  return parseRestPayload<ExistingSlotRecord[]>(response, []);
}

async function insertTimeSlots(
  supabaseUrl: string,
  serviceRoleKey: string,
  slots: TimeSlotSeed[]
) {
  if (!slots.length) {
    return;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/time_slots`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "return=minimal"
    },
    body: JSON.stringify(slots),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("No se pudieron generar los horarios faltantes.");
  }
}

export async function ensureBookingSlotHorizon(
  supabaseUrl: string,
  serviceRoleKey: string,
  requestedDate: string
) {
  if (!supabaseUrl || !serviceRoleKey || !requestedDate) {
    return;
  }

  const courtIds = await fetchActiveCourtIds(supabaseUrl, serviceRoleKey);

  if (!courtIds.length) {
    return;
  }

  const today = todayArgentinaDateKey();
  const horizonEnd = [requestedDate, addDays(today, SLOT_HORIZON_DAYS)].sort(
    compareDateKeys
  )[1];
  const latestSlotDate = await fetchLatestSlotDate(supabaseUrl, serviceRoleKey);

  if (!latestSlotDate || compareDateKeys(latestSlotDate, horizonEnd) < 0) {
    const generationStart = latestSlotDate
      ? addDays(latestSlotDate, 1)
      : today;
    const slotsToInsert: TimeSlotSeed[] = [];

    for (
      let currentDate = generationStart;
      compareDateKeys(currentDate, horizonEnd) <= 0;
      currentDate = addDays(currentDate, 1)
    ) {
      slotsToInsert.push(
        ...buildMissingTimeSlotsForDate(currentDate, courtIds)
      );
    }

    await insertTimeSlots(supabaseUrl, serviceRoleKey, slotsToInsert);
  }

  const requestedExistingSlots = await fetchExistingSlotsForDate(
    supabaseUrl,
    serviceRoleKey,
    requestedDate
  );
  const requestedMissingSlots = buildMissingTimeSlotsForDate(
    requestedDate,
    courtIds,
    requestedExistingSlots
  );

  if (requestedMissingSlots.length) {
    await insertTimeSlots(supabaseUrl, serviceRoleKey, requestedMissingSlots);
  }
}
