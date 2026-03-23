"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchLiveStreamStatus } from "@/lib/supabase";
import { LiveScoreboard, LiveStreamConfig } from "@/types/db";

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

export default function LivePage() {
  const [stream, setStream] = useState<LiveStreamConfig | null>(null);
  const [scoreboard, setScoreboard] = useState<LiveScoreboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStream() {
      try {
        const current = await fetchLiveStreamStatus();
        setStream(current.stream);
        setScoreboard(current.scoreboard);
      } catch {
        setStream(null);
        setScoreboard(null);
      } finally {
        setLoading(false);
      }
    }

    void loadStream();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle
        title="Transmisión en vivo"
        subtitle="Seguí los vivos de La Martineta directo desde la app."
      />

      {loading ? (
        <div className="card p-6 text-sm text-slate-500">Cargando transmisión...</div>
      ) : stream ? (
        <section className="card overflow-hidden p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                stream.is_live
                  ? "bg-red-100 text-red-700"
                  : "bg-orange-100 text-orange-700"
              }`}
            >
              {stream.is_live ? "En vivo ahora" : "Próxima transmisión"}
            </span>
            <span className="text-sm text-slate-500">
              {formatStartsAt(stream.starts_at)}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <h2 className="text-3xl font-bold text-slate-950">{stream.title}</h2>
            {stream.description ? (
              <p className="max-w-3xl text-sm text-slate-600">
                {stream.description}
              </p>
            ) : null}
          </div>

          {stream.banner_url ? (
            <div className="mt-6 overflow-hidden rounded-3xl border border-orange-200 bg-slate-100 shadow-sm">
              <div
                className="h-56 w-full bg-cover bg-center bg-no-repeat sm:h-72"
                style={{ backgroundImage: `url("${stream.banner_url}")` }}
              />
            </div>
          ) : null}

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-black shadow-sm">
            <div className="aspect-video">
              <iframe
                className="h-full w-full"
                src={stream.embed_url}
                title={stream.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>

          {scoreboard ? (
            <section className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
                    Marcador en vivo
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Actualizado: {new Date(scoreboard.updated_at).toLocaleString("es-AR")}
                  </p>
                </div>
                {scoreboard.result ? (
                  <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                    {scoreboard.result}
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <article className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Jugador 1
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-950">
                    {scoreboard.player_one_name}
                  </h3>
                  {scoreboard.winner_side === 1 ? (
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      Ganador
                    </p>
                  ) : null}
                </article>

                <article className="rounded-2xl bg-white px-4 py-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                    Jugador 2
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-slate-950">
                    {scoreboard.player_two_name}
                  </h3>
                  {scoreboard.winner_side === 2 ? (
                    <p className="mt-2 text-sm font-medium text-emerald-700">
                      Ganador
                    </p>
                  ) : null}
                </article>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {scoreboard.game_scores ? (
                  <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Games
                    </p>
                    <p className="mt-2 text-base font-semibold text-slate-900">
                      {scoreboard.game_scores}
                    </p>
                  </div>
                ) : null}

                {(scoreboard.event_name || scoreboard.round_name || scoreboard.location) ? (
                  <div className="rounded-2xl border border-orange-200 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Partido
                    </p>
                    {scoreboard.event_name ? (
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {scoreboard.event_name}
                      </p>
                    ) : null}
                    {scoreboard.round_name ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {scoreboard.round_name}
                      </p>
                    ) : null}
                    {scoreboard.location ? (
                      <p className="mt-1 text-sm text-slate-500">
                        {scoreboard.location}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={stream.youtube_url}
              target="_blank"
              rel="noreferrer"
              className="btn-accent"
            >
              Abrir en YouTube
            </a>
            <Link href="/tournaments" className="btn-secondary">
              Volver a torneos
            </Link>
          </div>
        </section>
      ) : (
        <section className="card p-6">
          <p className="text-base font-medium text-slate-900">
            Todavía no hay una transmisión cargada.
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Cuando el club active un vivo de YouTube, va a aparecer acá.
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
