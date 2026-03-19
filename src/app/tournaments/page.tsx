"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchExternalTournaments } from "@/lib/supabase";
import { ExternalTournament } from "@/types/db";

const platformLabels: Record<string, string> = {
  rankedin: "Rankedin",
  tournamentsoftware: "Tournament Software",
  otro: "Otro"
};

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<ExternalTournament[]>([]);
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

  return (
    <div className="space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="Torneos externos"
        subtitle="Consulta torneos cargados desde admin y abre el cuadro original en Rankedin o Tournament Software."
      />

      {loading ? <p>Cargando torneos...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error ? (
        tournaments.length ? (
          <div className="grid gap-4">
            {tournaments.map((tournament) => (
              <article key={tournament.id} className="card rounded-2xl p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-900">
                        {tournament.title}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {platformLabels[tournament.platform] || "Otro"}
                      </span>
                    </div>

                    {tournament.event_date ? (
                      <p className="text-sm text-slate-600">
                        Fecha: {tournament.event_date}
                      </p>
                    ) : null}

                    {tournament.location ? (
                      <p className="text-sm text-slate-600">
                        Lugar: {tournament.location}
                      </p>
                    ) : null}

                    {tournament.notes ? (
                      <p className="text-sm text-slate-500">{tournament.notes}</p>
                    ) : null}
                  </div>

                  <a
                    href={tournament.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary whitespace-nowrap"
                  >
                    Ver torneo
                  </a>
                </div>
              </article>
            ))}
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
