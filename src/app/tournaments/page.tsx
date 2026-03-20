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

function getTodayMarker() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
}

function getTournamentDateMarker(eventDate: string | null) {
  if (!eventDate) return null;
  const date = new Date(`${eventDate}T12:00:00`);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isUpcomingTournament(tournament: ExternalTournament) {
  const marker = getTournamentDateMarker(tournament.event_date);
  if (marker === null) return true;
  return marker >= getTodayMarker();
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

function TournamentCard({
  tournament
}: {
  tournament: ExternalTournament;
}) {
  const status = getStatusMeta(tournament);
  const compactDate = formatDateCompact(tournament.event_date);
  const platformClass =
    platformBadgeClasses[tournament.platform] || platformBadgeClasses.otro;

  return (
    <article className="card rounded-2xl p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-center">
            <span className="text-2xl font-black text-slate-950">
              {compactDate.day}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
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
            </div>

            <p className="text-sm font-medium text-slate-700">
              {formatDate(tournament.event_date)}
            </p>

            {tournament.location ? (
              <p className="text-sm text-slate-600">Sede: {tournament.location}</p>
            ) : null}

            {tournament.notes ? (
              <p className="text-sm leading-6 text-slate-500">
                {tournament.notes}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 md:min-w-[168px]">
          <a
            href={tournament.url}
            target="_blank"
            rel="noreferrer"
            className="btn-primary justify-center whitespace-nowrap"
          >
            Ver torneo
          </a>
          <a
            href={tournament.url}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary justify-center whitespace-nowrap"
          >
            Abrir plataforma
          </a>
        </div>
      </div>
    </article>
  );
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<ExternalTournament[]>([]);
  const [filter, setFilter] = useState<TournamentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const filteredTournaments = useMemo(() => {
    return tournaments.filter((tournament) => {
      if (filter === "all") return true;
      if (filter === "rankedin") return tournament.platform === "rankedin";
      if (filter === "tournamentsoftware") {
        return tournament.platform === "tournamentsoftware";
      }
      if (filter === "upcoming") return isUpcomingTournament(tournament);
      if (filter === "past") return !isUpcomingTournament(tournament);
      return true;
    });
  }, [filter, tournaments]);

  const { featuredTournament, upcomingTournaments, pastTournaments } = useMemo(() => {
    const upcoming = filteredTournaments
      .filter((tournament) => isUpcomingTournament(tournament))
      .sort((a, b) => {
        const aMarker = getTournamentDateMarker(a.event_date) ?? Number.MAX_SAFE_INTEGER;
        const bMarker = getTournamentDateMarker(b.event_date) ?? Number.MAX_SAFE_INTEGER;
        return aMarker - bMarker;
      });

    const past = filteredTournaments
      .filter((tournament) => !isUpcomingTournament(tournament))
      .sort((a, b) => {
        const aMarker = getTournamentDateMarker(a.event_date) ?? 0;
        const bMarker = getTournamentDateMarker(b.event_date) ?? 0;
        return bMarker - aMarker;
      });

    return {
      featuredTournament: upcoming[0] ?? null,
      upcomingTournaments: upcoming.slice(1),
      pastTournaments: past
    };
  }, [filteredTournaments]);

  const totalUpcoming = useMemo(
    () => tournaments.filter((tournament) => isUpcomingTournament(tournament)).length,
    [tournaments]
  );

  return (
    <div className="space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="Torneos externos"
        subtitle="Consulta próximos torneos, accede rápido a la plataforma original y deja el historial separado para leer mejor."
      />

      {loading ? <p>Cargando torneos...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error ? (
        tournaments.length ? (
          <div className="space-y-6">
            <section className="card rounded-2xl border-orange-200 bg-gradient-to-br from-orange-50 to-white p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
                    Próximo torneo destacado
                  </p>

                  {featuredTournament ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-3xl font-black tracking-tight text-slate-950">
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

                      <p className="text-base font-medium text-slate-700">
                        {formatDate(featuredTournament.event_date)}
                      </p>

                      {featuredTournament.location ? (
                        <p className="text-sm text-slate-600">
                          Sede: {featuredTournament.location}
                        </p>
                      ) : null}

                      {featuredTournament.notes ? (
                        <p className="max-w-2xl text-sm leading-6 text-slate-600">
                          {featuredTournament.notes}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-sm text-slate-600">
                      No hay torneos próximos para destacar con el filtro actual.
                    </p>
                  )}
                </div>

                {featuredTournament ? (
                  <a
                    href={featuredTournament.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary justify-center whitespace-nowrap"
                  >
                    Ver torneo
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
                  Inscripciones, cuadros y enlaces activos.
                </p>
              </div>

              {upcomingTournaments.length ? (
                <div className="grid gap-4">
                  {upcomingTournaments.map((tournament) => (
                    <TournamentCard key={tournament.id} tournament={tournament} />
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
                    <TournamentCard key={tournament.id} tournament={tournament} />
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
