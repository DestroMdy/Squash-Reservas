"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchLiveStream } from "@/lib/supabase";
import { LiveStreamConfig } from "@/types/db";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStream() {
      try {
        const current = await fetchLiveStream();
        setStream(current);
      } catch {
        setStream(null);
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
