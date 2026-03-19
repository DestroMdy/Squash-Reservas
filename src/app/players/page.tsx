"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchPlayers, getSession } from "@/lib/supabase";
import { Profile } from "@/types/db";

const categoryOrder = [
  "Primera",
  "Segunda",
  "Tercera",
  "Cuarta",
  "Quinta",
  "Principiante",
  "Sin categoría"
];

export default function PlayersPage() {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const session = getSession();
        if (!session?.access_token) {
          setError("Debes iniciar sesión");
          return;
        }

        setCurrentUserId(session.user?.id ?? null);
        const data = await fetchPlayers(session.access_token);
        setPlayers(data ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la lista de jugadores"
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const groupedPlayers = useMemo(() => {
    const groups: Record<string, Profile[]> = {};

    for (const category of categoryOrder) {
      groups[category] = [];
    }

    for (const player of players) {
      const category = player.category?.trim() || "Sin categoría";
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(player);
    }

    return groups;
  }, [players]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-secondary">
          Volver al inicio
        </Link>
        <div className="surface-pill text-xs uppercase tracking-[0.22em] text-slate-500">
          Comunidad del club
        </div>
      </div>

      <SectionTitle
        title="Jugadores por categoría"
        subtitle="Encuentra jugadores del club y contáctalos por privado sin exponer sus datos personales."
      />

      {loading ? (
        <div className="soft-panel px-4 py-5 text-sm text-slate-600">
          Cargando jugadores...
        </div>
      ) : null}

      {error ? (
        <div className="soft-panel border-red-200 bg-red-50/80 px-4 py-5 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-5">
          {categoryOrder.map((category) => {
            const categoryPlayers = groupedPlayers[category] || [];

            return (
              <section key={category} className="card p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-950">
                      {category}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {categoryPlayers.length
                        ? `${categoryPlayers.length} jugador${categoryPlayers.length === 1 ? "" : "es"} registrado${categoryPlayers.length === 1 ? "" : "s"}`
                        : "Aún no hay jugadores en esta categoría."}
                    </p>
                  </div>
                  <span className="surface-pill">{categoryPlayers.length}</span>
                </div>

                {categoryPlayers.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {categoryPlayers.map((player) => (
                      <article
                        key={player.id}
                        className="rounded-[24px] border border-slate-200/80 bg-white/82 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <img
                              src={player.avatar_url || "/icon-192.png"}
                              alt={player.full_name || "Jugador"}
                              className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xl font-bold tracking-tight text-slate-950">
                                {player.full_name || "Sin nombre"}
                              </p>
                              <p className="mt-1 text-sm font-medium text-slate-500">
                                {player.category || "Sin categoría"}
                              </p>
                            </div>
                          </div>

                          {player.id !== currentUserId ? (
                            <Link
                              href={`/messages?to=${player.id}`}
                              className="btn-secondary w-full text-center sm:w-auto"
                            >
                              Enviar mensaje
                            </Link>
                          ) : (
                            <span className="surface-pill justify-center text-center sm:justify-start">
                              Tu perfil
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
