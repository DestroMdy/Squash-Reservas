"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AvatarImage } from "../../components/AvatarImage";
import { isProfileCompletionRecordComplete } from "../../lib/profile-completion";
import { fetchPlayers, getSession } from "../../lib/supabase";
import { SectionTitle } from "../../components/SectionTitle";
import { Profile } from "../../types/db";

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
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="Jugadores por categoría"
        subtitle="Listado de jugadores registrados en el club."
      />

      {loading ? <p>Cargando jugadores...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="space-y-6">
          {categoryOrder.map((category) => {
            const categoryPlayers = groupedPlayers[category] || [];

            return (
              <section key={category} className="card rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900">{category}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                    {categoryPlayers.length}
                  </span>
                </div>

                {categoryPlayers.length ? (
                  <div className="space-y-3">
                    {categoryPlayers.map((player) => (
                      <article
                        key={player.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <AvatarImage
                              src={player.avatar_url}
                              alt={player.full_name || "Jugador"}
                              size={64}
                              className="h-16 w-16 rounded-full border border-slate-200 object-cover"
                            />
                            <div className="min-w-0">
                              <p className="text-lg font-semibold text-slate-900">
                                {player.full_name || "Sin nombre"}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {player.category || "Sin categoría"}
                              </p>
                            </div>
                          </div>

                          {player.id !== currentUserId ? (
                            isProfileCompletionRecordComplete(player) ? (
                            <Link
                              href={`/messages?to=${player.id}`}
                              className="btn-secondary w-full text-center sm:w-auto sm:shrink-0 sm:whitespace-nowrap"
                            >
                              Enviar mensaje
                            </Link>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500 sm:text-left">
                                Perfil incompleto
                              </span>
                            )
                          ) : (
                            <span className="rounded-full bg-slate-100 px-3 py-2 text-center text-xs font-medium text-slate-500 sm:text-left">
                              Tu perfil
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No hay jugadores en esta categoría.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
