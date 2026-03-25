"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarImage } from "@/components/AvatarImage";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchLiveCenterStatus } from "@/lib/supabase";
import { LiveCourtState, LiveScoreboard } from "@/types/db";

const LIVE_REFRESH_MS = 3_000;
const DEFAULT_SCOREBOARD_DELAY_MS = 5_000;

function formatStartsAt(value: string | null) {
  if (!value) {
    return "Horario a confirmar";
  }

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function LiveCourtBroadcastCard({ court }: { court: LiveCourtState }) {
  const stream = court.stream;
  const scoreboard = court.scoreboard;
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const scoreboardDelayMs = Math.max(
    0,
    (stream?.scoreboard_delay_seconds ?? 5) * 1000
  );
  const [visibleScoreboard, setVisibleScoreboard] = useState<LiveScoreboard | null>(
    scoreboard
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!scoreboard) {
      setVisibleScoreboard(null);
      return;
    }

    const updatedAt = new Date(scoreboard.updated_at).getTime();
    const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
    const effectiveDelayMs = Number.isFinite(scoreboardDelayMs)
      ? scoreboardDelayMs
      : DEFAULT_SCOREBOARD_DELAY_MS;
    const delayMs = Math.max(0, effectiveDelayMs - Math.max(0, ageMs));

    const timer = window.setTimeout(() => {
      setVisibleScoreboard(scoreboard);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [scoreboard, scoreboardDelayMs]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenContainerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  async function handleEnterFullscreen() {
    if (!fullscreenContainerRef.current || !document.fullscreenEnabled) {
      return;
    }

    try {
      await fullscreenContainerRef.current.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  }

  async function handleExitFullscreen() {
    if (!document.fullscreenElement) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  }

  if (!stream) {
    return (
      <article className="card rounded-3xl p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {court.label}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">
              Sin transmision configurada
            </h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            Offline
          </span>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          Cuando el club cargue YouTube para esta cancha, va a aparecer aca con el
          player y el marcador automatico.
        </p>
      </article>
    );
  }

  return (
    <article className="card overflow-hidden rounded-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {court.label}
          </p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950">{stream.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              stream.is_live
                ? "bg-red-100 text-red-700"
                : "bg-orange-100 text-orange-700"
            }`}
          >
            {stream.is_live ? "En vivo ahora" : "Programada"}
          </span>
          <span className="text-sm text-slate-500">
            {formatStartsAt(stream.starts_at)}
          </span>
        </div>
      </div>

      {stream.description ? (
        <p className="mt-4 text-sm leading-6 text-slate-600">{stream.description}</p>
      ) : null}

      {stream.banner_url ? (
        <div className="mt-5 overflow-hidden rounded-3xl border border-orange-200 bg-slate-100 shadow-sm">
          <div
            className="h-44 w-full bg-cover bg-center bg-no-repeat sm:h-56"
            style={{ backgroundImage: `url("${stream.banner_url}")` }}
          />
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <div
          ref={fullscreenContainerRef}
          className={`group relative overflow-hidden rounded-3xl border border-slate-200 bg-black shadow-sm ${
            isFullscreen ? "h-screen w-screen rounded-none border-none" : ""
          }`}
        >
          <div className={isFullscreen ? "h-full w-full" : "aspect-video"}>
            <iframe
              className="h-full w-full"
              src={stream.embed_url}
              title={`${court.label} - ${stream.title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>

          {visibleScoreboard ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <div className="mx-auto max-w-5xl">
                <div
                  className={`rounded-2xl border border-white/15 bg-slate-950/68 text-white shadow-2xl backdrop-blur-md ${
                    isFullscreen
                      ? "mx-auto max-w-3xl px-4 py-3"
                      : "ml-0 mr-auto max-w-xl px-3 py-2.5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-300">
                        Marcador en vivo
                      </p>
                      <p className="mt-1 text-[11px] text-white/65">
                        {court.label} · demora configurada {stream.scoreboard_delay_seconds}s
                      </p>
                    </div>
                    {visibleScoreboard.result ? (
                      <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                        {visibleScoreboard.result}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AvatarImage
                        src={visibleScoreboard.player_one_avatar_url}
                        alt={visibleScoreboard.player_one_name}
                        size={isFullscreen ? 44 : 34}
                        className="h-[34px] w-[34px] shrink-0 rounded-full border border-white/20 object-cover shadow-md sm:h-11 sm:w-11"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold sm:text-base">
                          {visibleScoreboard.player_one_name}
                        </p>
                        {visibleScoreboard.winner_side === 1 ? (
                          <p className="mt-1 text-[11px] font-medium text-emerald-300">
                            Ganador
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/60">
                        Games
                      </p>
                      <p className="mt-1 text-sm font-bold text-white sm:text-base">
                        {visibleScoreboard.game_scores || "-"}
                      </p>
                    </div>
                    <div className="flex min-w-0 items-center justify-end gap-2.5">
                      <div className="min-w-0 text-right">
                        <p className="truncate text-sm font-semibold sm:text-base">
                          {visibleScoreboard.player_two_name}
                        </p>
                        {visibleScoreboard.winner_side === 2 ? (
                          <p className="mt-1 text-[11px] font-medium text-emerald-300">
                            Ganador
                          </p>
                        ) : null}
                      </div>
                      <AvatarImage
                        src={visibleScoreboard.player_two_avatar_url}
                        alt={visibleScoreboard.player_two_name}
                        size={isFullscreen ? 44 : 34}
                        className="h-[34px] w-[34px] shrink-0 rounded-full border border-white/20 object-cover shadow-md sm:h-11 sm:w-11"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
            <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
              <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                {court.label}
              </span>
              {isFullscreen ? (
                <button
                  type="button"
                  onClick={handleExitFullscreen}
                  className="pointer-events-auto rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-slate-950/85"
                >
                  Cerrar pantalla completa
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={isFullscreen ? handleExitFullscreen : handleEnterFullscreen}
            className="btn-secondary"
          >
            {isFullscreen ? "Salir de pantalla completa" : "Pantalla completa con marcador"}
          </button>
          <a
            href={stream.youtube_url}
            target="_blank"
            rel="noreferrer"
            className="btn-accent"
          >
            Abrir en YouTube
          </a>
        </div>
      </div>

      {visibleScoreboard ? (
        <section className="mt-5 rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
                Marcador automatico
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Actualizado: {new Date(visibleScoreboard.updated_at).toLocaleString("es-AR")}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Sincronizado con la transmision con una demora de {stream.scoreboard_delay_seconds} s para acompaÃ±ar el vivo.
              </p>
            </div>
            {visibleScoreboard.result ? (
              <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                {visibleScoreboard.result}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl bg-white px-4 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <AvatarImage
                  src={visibleScoreboard.player_one_avatar_url}
                  alt={visibleScoreboard.player_one_name}
                  size={52}
                  className="h-[52px] w-[52px] rounded-full border border-slate-200 object-cover shadow-sm"
                />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Jugador 1
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-950">
                    {visibleScoreboard.player_one_name}
                  </h3>
                  {visibleScoreboard.winner_side === 1 ? (
                    <p className="mt-2 text-sm font-medium text-emerald-700">Ganador</p>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="rounded-2xl bg-white px-4 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <AvatarImage
                  src={visibleScoreboard.player_two_avatar_url}
                  alt={visibleScoreboard.player_two_name}
                  size={52}
                  className="h-[52px] w-[52px] rounded-full border border-slate-200 object-cover shadow-sm"
                />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Jugador 2
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-950">
                    {visibleScoreboard.player_two_name}
                  </h3>
                  {visibleScoreboard.winner_side === 2 ? (
                    <p className="mt-2 text-sm font-medium text-emerald-700">Ganador</p>
                  ) : null}
                </div>
              </div>
            </article>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibleScoreboard.game_scores ? (
              <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Games
                </p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {visibleScoreboard.game_scores}
                </p>
              </div>
            ) : null}

            {(visibleScoreboard.event_name ||
              visibleScoreboard.round_name ||
              visibleScoreboard.location) ? (
              <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                  Partido
                </p>
                {visibleScoreboard.event_name ? (
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {visibleScoreboard.event_name}
                  </p>
                ) : null}
                {visibleScoreboard.round_name ? (
                  <p className="mt-1 text-sm text-slate-600">
                    {visibleScoreboard.round_name}
                  </p>
                ) : null}
                {visibleScoreboard.location ? (
                  <p className="mt-1 text-sm text-slate-500">{visibleScoreboard.location}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          El marcador de Squore va a aparecer aca apenas la tablet de {court.label.toLowerCase()} empiece a postear.
        </div>
      )}
    </article>
  );
}

export default function LivePage() {
  const [courts, setCourts] = useState<LiveCourtState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let loadingInFlight = false;

    async function loadStream() {
      if (loadingInFlight) {
        return;
      }

      loadingInFlight = true;

      try {
        const current = await fetchLiveCenterStatus();
        if (!cancelled) {
          setCourts(current.courts);
        }
      } catch {
        if (!cancelled) {
          setCourts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }

        loadingInFlight = false;
      }
    }

    void loadStream();

    const intervalId = window.setInterval(() => {
      void loadStream();
    }, LIVE_REFRESH_MS);

    const handleFocus = () => {
      void loadStream();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const configuredCourts = useMemo(
    () => courts.filter((court) => court.stream),
    [courts]
  );

  const activeCount = useMemo(
    () => courts.filter((court) => court.stream?.is_live).length,
    [courts]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionTitle
        title="Centro en vivo"
        subtitle="Segui las transmisiones de La Martineta en simultaneo, una por cada cancha."
      />

      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Cargando centro en vivo...</div>
      ) : configuredCourts.length ? (
        <>
          <section className="card rounded-3xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Estado general
                </p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">
                  {activeCount > 0
                    ? `${activeCount} cancha${activeCount > 1 ? "s" : ""} en vivo`
                    : `${configuredCourts.length} cancha${configuredCourts.length > 1 ? "s" : ""} configurada${configuredCourts.length > 1 ? "s" : ""}`}
                </h2>
              </div>
              <Link href="/tournaments" className="btn-secondary">
                Volver a torneos
              </Link>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            {courts.map((court) => (
              <LiveCourtBroadcastCard key={court.id} court={court} />
            ))}
          </div>
        </>
      ) : (
        <section className="card p-6">
          <p className="text-base font-medium text-slate-900">
            Todavia no hay transmisiones cargadas.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Cuando el club active los vivos de YouTube, van a aparecer aca para ambas canchas.
          </p>
          <div className="mt-4">
            <Link href="/" className="btn-secondary">
              Volver al inicio
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
