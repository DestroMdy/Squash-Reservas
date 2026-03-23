"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchExternalTournaments, fetchLiveCenterStatus } from "@/lib/supabase";
import {
  ExternalTournament,
  ExternalTournamentPlatform,
  LiveCourtState
} from "@/types/db";

const GENERIC_TOURNAMENT_URLS = new Set([
  "https://rankedin.com/",
  "https://www.rankedin.com/",
  "https://www.tournamentsoftware.com/",
  "https://tournamentsoftware.com/"
]);

const OFFICIAL_PLATFORM_HOSTS: Record<
  Extract<ExternalTournamentPlatform, "rankedin" | "tournamentsoftware">,
  string[]
> = {
  rankedin: ["rankedin.com"],
  tournamentsoftware: ["tournamentsoftware.com"]
};

function formatTournamentDate(date: string | null | undefined) {
  if (!date) return "Fecha a confirmar";

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(`${date}T12:00:00`));
}

function formatLiveDate(value: string | null | undefined) {
  if (!value) return "Horario a confirmar";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getTournamentMarker(tournament: ExternalTournament) {
  if (!tournament.event_date) {
    return Number.MAX_SAFE_INTEGER;
  }

  return new Date(`${tournament.event_date}T12:00:00`).getTime();
}

function hasRealTournamentLink(tournament: ExternalTournament) {
  return Boolean(tournament.url?.trim()) && !GENERIC_TOURNAMENT_URLS.has(tournament.url.trim());
}

function hasFeaturedTournamentLink(tournament: ExternalTournament) {
  if (!hasRealTournamentLink(tournament)) {
    return false;
  }

  if (
    tournament.platform !== "rankedin" &&
    tournament.platform !== "tournamentsoftware"
  ) {
    return false;
  }

  try {
    const hostname = new URL(tournament.url.trim()).hostname.toLowerCase();
    return OFFICIAL_PLATFORM_HOSTS[tournament.platform].some(
      (allowedHost) =>
        hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}

export default function TournamentCenterPage() {
  const [tournaments, setTournaments] = useState<ExternalTournament[]>([]);
  const [liveCourts, setLiveCourts] = useState<LiveCourtState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [nextTournaments, liveCenter] = await Promise.all([
          fetchExternalTournaments(),
          fetchLiveCenterStatus()
        ]);
        setTournaments(nextTournaments || []);
        setLiveCourts(liveCenter.courts || []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar el dashboard del torneo."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const upcomingTournaments = useMemo(() => {
    const today = new Date();
    const todayMarker = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).getTime();

    return tournaments
      .filter((tournament) => getTournamentMarker(tournament) >= todayMarker)
      .sort((a, b) => getTournamentMarker(a) - getTournamentMarker(b));
  }, [tournaments]);

  const highlightedTournament = upcomingTournaments[0] || null;
  const configuredLiveCourts = liveCourts.filter((court) => court.stream);

  return (
    <div className="space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="Dashboard de torneo"
        subtitle="Panel rápido para seguir las canchas en vivo, el torneo destacado y los accesos principales del evento."
      />

      {loading ? (
        <div className="card rounded-2xl p-5 text-sm text-slate-500">
          Cargando dashboard...
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Link href="/live" className="card rounded-2xl p-5 transition hover:border-orange-300">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                En vivo
              </p>
              <h2 className="mt-3 text-xl font-bold text-slate-950">
                {configuredLiveCourts.length
                  ? `${configuredLiveCourts.length} cancha${configuredLiveCourts.length > 1 ? "s" : ""} activas`
                  : "Centro en vivo"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Sigue ambas transmisiones y el score automático de Squore.
              </p>
            </Link>

            <Link
              href="/tournaments"
              className="card rounded-2xl p-5 transition hover:border-orange-300"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Calendario
              </p>
              <h2 className="mt-3 text-xl font-bold text-slate-950">
                {upcomingTournaments.length} próximo{upcomingTournaments.length === 1 ? "" : "s"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Fechas oficiales, links y sedes del circuito.
              </p>
            </Link>

            <Link href="/club" className="card rounded-2xl p-5 transition hover:border-orange-300">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                El club
              </p>
              <h2 className="mt-3 text-xl font-bold text-slate-950">
                Reglas y experiencia
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Todo lo importante de La Martineta en una sola página.
              </p>
            </Link>
          </section>

          {highlightedTournament ? (
            <section className="card rounded-2xl border-orange-300 bg-gradient-to-br from-orange-50 via-white to-orange-50/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
                Torneo destacado
              </p>
              <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight text-slate-950">
                    {highlightedTournament.title}
                  </h2>
                  <p className="text-base font-medium text-slate-700">
                    {formatTournamentDate(highlightedTournament.event_date)}
                  </p>
                  <p className="text-sm text-slate-600">
                    {highlightedTournament.location || "Sede a confirmar"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link href="/tournaments" className="btn-secondary">
                    Ver todos los torneos
                  </Link>
                  {hasFeaturedTournamentLink(highlightedTournament) ? (
                    <a
                      href={highlightedTournament.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-accent"
                    >
                      Ver enlace oficial
                    </a>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-2">
            {configuredLiveCourts.length ? (
              configuredLiveCourts.map((court) => (
                <article key={court.id} className="card rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {court.label}
                      </p>
                      <h3 className="mt-2 text-xl font-bold text-slate-950">
                        {court.stream?.title}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        court.stream?.is_live
                          ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {court.stream?.is_live ? "En vivo" : "Programada"}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    {formatLiveDate(court.stream?.starts_at)}
                  </p>

                  {court.scoreboard ? (
                    <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-4 text-white">
                      <p className="text-sm font-semibold text-orange-300">
                        {court.scoreboard.player_one_name} vs {court.scoreboard.player_two_name}
                      </p>
                      <p className="mt-2 text-2xl font-black">
                        {court.scoreboard.result || "En juego"}
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        {court.scoreboard.game_scores || "Sin games cargados"}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      El marcador va a aparecer acá apenas Squore empiece a postear.
                    </div>
                  )}
                </article>
              ))
            ) : (
              <article className="card rounded-2xl p-5 xl:col-span-2">
                <p className="text-base font-medium text-slate-900">
                  Todavía no hay canchas configuradas para el centro en vivo.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Cuando el club programe las transmisiones, este tablero va a mostrar ambas canchas.
                </p>
              </article>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
