"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchExternalTournaments } from "@/lib/supabase";
import { ExternalTournament, ExternalTournamentPlatform } from "@/types/db";

type TournamentFilter =
  | "all"
  | "rankedin"
  | "tournamentsoftware"
  | "upcoming"
  | "past";

type UserCoordinates = {
  latitude: number;
  longitude: number;
};

const GENERIC_TOURNAMENT_URLS = new Set([
  "https://aasra.com.ar/",
  "https://aasra.com.ar"
]);

const venueCoordinates: Record<string, UserCoordinates> = {
  "Comodoro Rivadavia": { latitude: -45.8641, longitude: -67.4966 },
  "Asunción, Paraguay": { latitude: -25.2637, longitude: -57.5759 },
  Córdoba: { latitude: -31.4201, longitude: -64.1888 },
  Trelew: { latitude: -43.2489, longitude: -65.3051 },
  "San Juan": { latitude: -31.5375, longitude: -68.5364 },
  Rosario: { latitude: -32.9442, longitude: -60.6505 },
  "San Salvador, El Salvador": { latitude: 13.6929, longitude: -89.2182 },
  Chaco: { latitude: -27.4514, longitude: -58.9867 },
  "Puerto Madryn": { latitude: -42.7692, longitude: -65.0385 },
  "Tucumán": { latitude: -26.8083, longitude: -65.2176 },
  "Bucaramanga, Colombia": { latitude: 7.1193, longitude: -73.1227 },
  "Rosario, Santa Fe, Argentina": { latitude: -32.9442, longitude: -60.6505 },
  Salta: { latitude: -24.7829, longitude: -65.4232 },
  "Buenos Aires": { latitude: -34.6037, longitude: -58.3816 },
  Bariloche: { latitude: -41.1335, longitude: -71.3103 },
  "Mar del Plata": { latitude: -38.0055, longitude: -57.5426 },
  Mendoza: { latitude: -32.8895, longitude: -68.8458 },
  "Neuquén": { latitude: -38.9516, longitude: -68.0591 }
};

const platformLabels: Record<ExternalTournamentPlatform, string> = {
  rankedin: "Rankedin",
  tournamentsoftware: "Tournament Software",
  otro: "Otro"
};

const platformBadgeClasses: Record<ExternalTournamentPlatform, string> = {
  rankedin: "bg-orange-100 text-orange-800",
  tournamentsoftware: "bg-slate-100 text-slate-700",
  otro: "bg-zinc-100 text-zinc-700"
};

const filterLabels: Record<TournamentFilter, string> = {
  all: "Todos",
  rankedin: "Rankedin",
  tournamentsoftware: "Tournament Software",
  upcoming: "Próximos",
  past: "Finalizados"
};

function isLaMartinetaFeaturedTournament(tournament: ExternalTournament) {
  const normalizedUrl = tournament.url?.toLowerCase() || "";
  const normalizedTitle = tournament.title?.toLowerCase() || "";
  const normalizedLocation = tournament.location?.toLowerCase() || "";

  return (
    normalizedUrl.includes("patagonico.la-martineta.com.ar") ||
    (normalizedTitle.includes("patag") && normalizedLocation.includes("comodoro"))
  );
}

function getTodayMarker() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function getTournamentDateMarker(eventDate: string | null) {
  if (!eventDate) return null;
  const date = new Date(`${eventDate}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

const monthMap: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11
};

function normalizeMonth(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getTournamentEndMarker(tournament: ExternalTournament) {
  if (!tournament.event_date) return null;

  const startDate = new Date(`${tournament.event_date}T12:00:00`);
  const fallback = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate()
  ).getTime();
  const notes = tournament.notes ?? "";

  const crossMonthMatch = notes.match(
    /(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+al\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i
  );

  if (crossMonthMatch) {
    const [, , , endDay, endMonthRaw] = crossMonthMatch;
    const endMonth = monthMap[normalizeMonth(endMonthRaw)];

    if (endMonth !== undefined) {
      return new Date(
        startDate.getFullYear(),
        endMonth,
        Number(endDay)
      ).getTime();
    }
  }

  const sameMonthMatch = notes.match(
    /(\d{1,2})\s+al\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i
  );

  if (sameMonthMatch) {
    const [, , endDay, endMonthRaw] = sameMonthMatch;
    const endMonth = monthMap[normalizeMonth(endMonthRaw)];

    if (endMonth !== undefined) {
      return new Date(
        startDate.getFullYear(),
        endMonth,
        Number(endDay)
      ).getTime();
    }
  }

  return fallback;
}

function isOngoingTournament(tournament: ExternalTournament) {
  const startMarker = getTournamentDateMarker(tournament.event_date);
  const endMarker = getTournamentEndMarker(tournament);
  const today = getTodayMarker();

  if (startMarker === null || endMarker === null) return false;
  return today >= startMarker && today <= endMarker;
}

function isUpcomingTournament(tournament: ExternalTournament) {
  const marker = getTournamentDateMarker(tournament.event_date);
  if (marker === null) return true;
  return marker > getTodayMarker();
}

function formatDate(eventDate: string | null) {
  if (!eventDate) return "Fecha a confirmar";

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(`${eventDate}T12:00:00`));
}

function formatDateCompact(eventDate: string | null) {
  if (!eventDate) {
    return { day: "--", month: "Sin fecha" };
  }

  const date = new Date(`${eventDate}T12:00:00`);
  return {
    day: new Intl.DateTimeFormat("es-AR", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("es-AR", { month: "short" }).format(date)
  };
}

function getStatusMeta(tournament: ExternalTournament) {
  if (!tournament.event_date) {
    return {
      label: "Fecha a confirmar",
      className: "bg-slate-100 text-slate-700"
    };
  }

  if (isOngoingTournament(tournament)) {
    return {
      label: "Torneo en curso",
      className: "bg-orange-100 text-orange-800"
    };
  }

  if (isUpcomingTournament(tournament)) {
    return {
      label: "Próximo",
      className: "bg-emerald-100 text-emerald-800"
    };
  }

  return {
    label: "Finalizado",
    className: "bg-slate-200 text-slate-700"
  };
}

function hasRealTournamentLink(tournament: ExternalTournament) {
  return Boolean(tournament.url?.trim()) && !GENERIC_TOURNAMENT_URLS.has(tournament.url.trim());
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  from: UserCoordinates,
  to: UserCoordinates
) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c);
}

function getTournamentDistance(
  tournament: ExternalTournament,
  userCoordinates: UserCoordinates | null
) {
  if (!userCoordinates || !tournament.location) return null;
  const coords = venueCoordinates[tournament.location];
  if (!coords) return null;
  return calculateDistanceKm(userCoordinates, coords);
}

function TournamentCard({
  tournament,
  userCoordinates,
  emphasized = false
}: {
  tournament: ExternalTournament;
  userCoordinates: UserCoordinates | null;
  emphasized?: boolean;
}) {
  const status = getStatusMeta(tournament);
  const compactDate = formatDateCompact(tournament.event_date);
  const platformClass =
    platformBadgeClasses[tournament.platform] || platformBadgeClasses.otro;
  const realLink = hasRealTournamentLink(tournament);
  const distanceKm = getTournamentDistance(tournament, userCoordinates);

  return (
    <article
      className={`card rounded-2xl p-5 ${
        emphasized
          ? "border-orange-300 bg-gradient-to-br from-orange-50 via-white to-orange-50/70 shadow-[0_18px_50px_-28px_rgba(249,115,22,0.55)]"
          : ""
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div
            className={`flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl text-center ${
              emphasized
                ? "border border-orange-300 bg-slate-950"
                : "border border-orange-200 bg-orange-50"
            }`}
          >
            <span className={`text-2xl font-black ${emphasized ? "text-white" : "text-slate-950"}`}>
              {compactDate.day}
            </span>
            <span
              className={`text-xs font-semibold uppercase tracking-[0.16em] ${
                emphasized ? "text-orange-400" : "text-orange-700"
              }`}
            >
              {compactDate.month}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">
                {tournament.title}
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${platformClass}`}
              >
                {platformLabels[tournament.platform] || "Otro"}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
              >
                {status.label}
              </span>
              {emphasized ? (
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-orange-400">
                  Fecha destacada La Martineta
                </span>
              ) : null}
            </div>

            <p className="text-sm font-medium text-slate-700">
              {formatDate(tournament.event_date)}
            </p>

            {tournament.location ? (
              <p className="text-sm text-slate-600">
                Sede: {tournament.location}
                {distanceKm !== null ? (
                  <span className="ml-2 font-medium text-orange-700">
                    · Aprox. {distanceKm} km
                  </span>
                ) : null}
              </p>
            ) : null}

            {tournament.notes ? (
              <p className="text-sm leading-6 text-slate-500">
                {tournament.notes}
              </p>
            ) : null}

          </div>
        </div>

        {realLink ? (
          <div className="flex shrink-0 flex-col gap-2 md:min-w-[168px]">
            <a
              href={tournament.url}
              target="_blank"
              rel="noreferrer"
              className={`justify-center whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                emphasized
                  ? "bg-orange-500 text-white shadow-[0_12px_30px_-18px_rgba(249,115,22,0.9)] hover:bg-orange-400"
                  : "btn-primary"
              }`}
            >
              {emphasized ? "Inscribirme ahora" : "Ver torneo"}
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<ExternalTournament[]>([]);
  const [filter, setFilter] = useState<TournamentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCoordinates, setUserCoordinates] = useState<UserCoordinates | null>(
    null
  );
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchExternalTournaments();
        setTournaments(data ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudieron cargar los torneos."
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        setLocationEnabled(true);
      },
      () => {
        setLocationEnabled(false);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 1000 * 60 * 30,
        timeout: 10000
      }
    );
  }, []);

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((tournament) => {
      if (filter === "all") return true;
      if (filter === "rankedin") return tournament.platform === "rankedin";
      if (filter === "tournamentsoftware") {
        return tournament.platform === "tournamentsoftware";
      }
      if (filter === "upcoming") {
        return isUpcomingTournament(tournament) || isOngoingTournament(tournament);
      }
      if (filter === "past") {
        return !isUpcomingTournament(tournament) && !isOngoingTournament(tournament);
      }
      return true;
    });
  }, [filter, tournaments]);

  const { featuredTournament, upcomingTournaments, pastTournaments, spotlightTournament } = useMemo(() => {
    const upcoming = filteredTournaments
      .filter(
        (tournament) =>
          isUpcomingTournament(tournament) || isOngoingTournament(tournament)
      )
      .sort((a, b) => {
        const aMarker = getTournamentDateMarker(a.event_date) ?? Number.MAX_SAFE_INTEGER;
        const bMarker = getTournamentDateMarker(b.event_date) ?? Number.MAX_SAFE_INTEGER;
        return aMarker - bMarker;
      });

    const past = filteredTournaments
      .filter(
        (tournament) =>
          !isUpcomingTournament(tournament) && !isOngoingTournament(tournament)
      )
      .sort((a, b) => {
        const aMarker = getTournamentDateMarker(a.event_date) ?? 0;
        const bMarker = getTournamentDateMarker(b.event_date) ?? 0;
        return bMarker - aMarker;
      });

    const spotlight =
      upcoming.find((tournament) => isLaMartinetaFeaturedTournament(tournament)) ?? null;
    const featured = spotlight ?? upcoming[0] ?? null;

    return {
      spotlightTournament: spotlight,
      featuredTournament: featured,
      upcomingTournaments: upcoming.filter((tournament) => tournament.id !== featured?.id),
      pastTournaments: past
    };
  }, [filteredTournaments]);

  const totalUpcoming = useMemo(
    () =>
      tournaments.filter(
        (tournament) =>
          isUpcomingTournament(tournament) || isOngoingTournament(tournament)
      ).length,
    [tournaments]
  );

  return (
    <div className="space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="Torneos externos"
        subtitle="Consulta próximos torneos, muestra la distancia desde tu ubicación cuando está disponible y habilita los links solo cuando el torneo ya tiene enlace real cargado."
      />

      {loading ? <p>Cargando torneos...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error ? (
        tournaments.length ? (
          <div className="space-y-6">
            <section
              className={`card rounded-2xl p-6 ${
                spotlightTournament
                  ? "border-orange-300 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.28),_transparent_34%),linear-gradient(135deg,#050505_0%,#111827_58%,#1f2937_100%)] text-white shadow-[0_30px_70px_-32px_rgba(249,115,22,0.65)]"
                  : "border-orange-200 bg-gradient-to-br from-orange-50 to-white"
              }`}
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <p
                    className={`text-xs font-semibold uppercase tracking-[0.22em] ${
                      spotlightTournament ? "text-orange-400" : "text-orange-700"
                    }`}
                  >
                    {spotlightTournament ? "Fecha destacada La Martineta" : "Próximo torneo destacado"}
                  </p>

                  {featuredTournament ? (
                    <>
                      {spotlightTournament ? (
                        <div className="inline-flex w-fit items-center rounded-full border border-orange-400/40 bg-orange-500/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
                          Nuestra fecha más importante
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <h2
                          className={`text-3xl font-black tracking-tight ${
                            spotlightTournament ? "text-white" : "text-slate-950"
                          }`}
                        >
                          {featuredTournament.title}
                        </h2>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            platformBadgeClasses[featuredTournament.platform] ||
                            platformBadgeClasses.otro
                          }`}
                        >
                          {platformLabels[featuredTournament.platform] || "Otro"}
                        </span>
                      </div>

                      <p
                        className={`text-base font-medium ${
                          spotlightTournament ? "text-slate-100" : "text-slate-700"
                        }`}
                      >
                        {formatDate(featuredTournament.event_date)}
                      </p>

                      {featuredTournament.location ? (
                        <p className={`text-sm ${spotlightTournament ? "text-slate-200" : "text-slate-600"}`}>
                          Sede: {featuredTournament.location}
                          {getTournamentDistance(featuredTournament, userCoordinates) !== null ? (
                            <span className={`ml-2 font-medium ${spotlightTournament ? "text-orange-300" : "text-orange-700"}`}>
                              · Aprox. {getTournamentDistance(featuredTournament, userCoordinates)} km
                            </span>
                          ) : null}
                        </p>
                      ) : null}

                      {featuredTournament.notes ? (
                        <p className={`max-w-2xl text-sm leading-6 ${spotlightTournament ? "text-slate-200" : "text-slate-600"}`}>
                          {featuredTournament.notes}
                        </p>
                      ) : null}

                      {spotlightTournament ? (
                        <p className="max-w-2xl text-sm font-medium leading-6 text-slate-100">
                          Toda la información oficial, inscripción y novedades de nuestra fecha están concentradas en el sitio especial del torneo.
                        </p>
                      ) : null}

                    </>
                  ) : (
                    <p className="text-sm text-slate-600">
                      No hay torneos próximos para destacar con el filtro actual.
                    </p>
                  )}
                </div>

                {featuredTournament && hasRealTournamentLink(featuredTournament) ? (
                  <a
                    href={featuredTournament.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`justify-center whitespace-nowrap rounded-xl px-5 py-3 text-sm font-semibold transition ${
                      spotlightTournament
                        ? "bg-orange-500 text-white shadow-[0_20px_40px_-24px_rgba(249,115,22,0.95)] hover:bg-orange-400"
                        : "btn-primary"
                    }`}
                  >
                    {spotlightTournament ? "Entrar al sitio oficial" : "Ver torneo"}
                  </a>
                ) : null}
              </div>
            </section>

            <section className="card rounded-2xl p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Explorar
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {totalUpcoming} torneo{totalUpcoming === 1 ? "" : "s"} próximo
                    {totalUpcoming === 1 ? "" : "s"} cargado{totalUpcoming === 1 ? "" : "s"}.
                  </p>
                  {!locationEnabled ? (
                    <p className="mt-1 text-sm text-slate-500">
                      Si activas ubicación, verás la distancia aproximada a cada sede.
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {(Object.keys(filterLabels) as TournamentFilter[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={
                        filter === key
                          ? "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                          : "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                      }
                    >
                      {filterLabels[key]}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Próximos torneos
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Inscripciones, sedes y enlaces activos.
                </p>
              </div>

              {upcomingTournaments.length ? (
                <div className="grid gap-4">
                  {upcomingTournaments.map((tournament) => (
                    <TournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      userCoordinates={userCoordinates}
                    />
                  ))}
                </div>
              ) : featuredTournament ? (
                <div className="card rounded-2xl p-6 text-center text-sm text-slate-600">
                  El torneo destacado es el único próximo con el filtro actual.
                </div>
              ) : (
                <div className="card rounded-2xl p-6 text-center text-sm text-slate-600">
                  No hay próximos torneos con el filtro actual.
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Torneos anteriores
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Historial para revisar resultados o cuadros ya cerrados.
                </p>
              </div>

              {pastTournaments.length ? (
                <div className="grid gap-4">
                  {pastTournaments.map((tournament) => (
                    <TournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      userCoordinates={userCoordinates}
                    />
                  ))}
                </div>
              ) : (
                <div className="card rounded-2xl p-6 text-center text-sm text-slate-600">
                  No hay torneos anteriores con el filtro actual.
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="card rounded-2xl p-6 text-center text-sm text-slate-600">
            No hay torneos externos cargados por ahora.
          </div>
        )
      ) : null}
    </div>
  );
}
