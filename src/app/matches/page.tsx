"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import {
  activateMatchAvailability,
  createCasualMatch,
  deactivateMatchAvailability,
  deleteCasualMatch,
  fetchCasualMatches,
  fetchMatchAvailability,
  fetchPlayers,
  getSession,
  getUser,
  updateCasualMatch
} from "@/lib/supabase";
import { CasualMatch, MatchAvailabilityRequest, Profile } from "@/types/db";

type MatchFormState = {
  opponent_id: string;
  played_on: string;
  score_self: string;
  score_opponent: string;
  notes: string;
};

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function getEmptyForm(): MatchFormState {
  return {
    opponent_id: "",
    played_on: getTodayInputDate(),
    score_self: "",
    score_opponent: "",
    notes: ""
  };
}

function formatPlayedOn(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(`${value}T12:00:00`));
}

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getMatchResult(match: CasualMatch, currentUserId: string | null) {
  const isPlayerOne = match.player_one_id === currentUserId;
  const myScore = isPlayerOne ? match.score_player_one : match.score_player_two;
  const opponentScore = isPlayerOne
    ? match.score_player_two
    : match.score_player_one;

  if (myScore > opponentScore) {
    return {
      label: "Ganaste",
      className: "bg-emerald-100 text-emerald-800"
    };
  }

  return {
    label: "Perdiste",
    className: "bg-rose-100 text-rose-800"
  };
}

function getOpponent(match: CasualMatch, currentUserId: string | null) {
  return match.player_one_id === currentUserId ? match.player_two : match.player_one;
}

export default function MatchesPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [matches, setMatches] = useState<CasualMatch[]>([]);
  const [availabilityRequests, setAvailabilityRequests] = useState<
    MatchAvailabilityRequest[]
  >([]);
  const [currentAvailability, setCurrentAvailability] =
    useState<MatchAvailabilityRequest | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [form, setForm] = useState<MatchFormState>(getEmptyForm());
  const [availabilityNote, setAvailabilityNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [availabilityUnavailable, setAvailabilityUnavailable] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    const token = getSession()?.access_token;
    if (!token) {
      setError("Debes iniciar sesión");
      setLoading(false);
      return;
    }

    const user = await getUser(token);
    if (!user) {
      setError("Sesión inválida");
      setLoading(false);
      return;
    }

    const [playersData, matchesData, availabilityData] = await Promise.all([
      fetchPlayers(token),
      fetchCasualMatches(token),
      fetchMatchAvailability(token).catch(() => ({
        requests: [],
        currentRequest: null,
        unavailable: true
      }))
    ]);

    setCurrentUserId(user.id);
    setPlayers((playersData || []).filter((player) => player.id !== user.id));
    setMatches(matchesData.matches || []);
    setUnavailable(matchesData.unavailable === true);
    setAvailabilityRequests(availabilityData.requests || []);
    setCurrentAvailability(availabilityData.currentRequest || null);
    setAvailabilityNote(availabilityData.currentRequest?.notes || "");
    setAvailabilityUnavailable(availabilityData.unavailable === true);
    setLoading(false);
    setError(null);
  }

  useEffect(() => {
    void loadData().catch((err) => {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los partidos");
      setLoading(false);
    });
  }, []);

  const summary = useMemo(() => {
    if (!currentUserId) {
      return { total: 0, wins: 0, losses: 0 };
    }

    return matches.reduce(
      (acc, match) => {
        acc.total += 1;
        const isPlayerOne = match.player_one_id === currentUserId;
        const myScore = isPlayerOne ? match.score_player_one : match.score_player_two;
        const opponentScore = isPlayerOne
          ? match.score_player_two
          : match.score_player_one;

        if (myScore > opponentScore) {
          acc.wins += 1;
        } else {
          acc.losses += 1;
        }

        return acc;
      },
      { total: 0, wins: 0, losses: 0 }
    );
  }, [currentUserId, matches]);

  const recentOpponents = useMemo(() => {
    const seen = new Set<string>();
    return matches
      .map((match) => getOpponent(match, currentUserId))
      .filter((player): player is NonNullable<typeof player> => Boolean(player))
      .filter((player) => {
        if (seen.has(player.id)) return false;
        seen.add(player.id);
        return true;
      })
      .slice(0, 4);
  }, [currentUserId, matches]);

  const ranking = useMemo(() => {
    if (!currentUserId) return [];

    const table = new Map<
      string,
      {
        player: NonNullable<ReturnType<typeof getOpponent>>;
        played: number;
        wins: number;
        losses: number;
        pointsFor: number;
        pointsAgainst: number;
      }
    >();

    for (const match of matches) {
      const opponent = getOpponent(match, currentUserId);
      if (!opponent) continue;

      const isPlayerOne = match.player_one_id === currentUserId;
      const myScore = isPlayerOne ? match.score_player_one : match.score_player_two;
      const opponentScore = isPlayerOne
        ? match.score_player_two
        : match.score_player_one;

      const current = table.get(opponent.id) ?? {
        player: opponent,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0
      };

      current.played += 1;
      current.pointsFor += myScore;
      current.pointsAgainst += opponentScore;

      if (myScore > opponentScore) {
        current.wins += 1;
      } else {
        current.losses += 1;
      }

      table.set(opponent.id, current);
    }

    return [...table.values()]
      .map((entry) => ({
        ...entry,
        winRate: entry.played ? Math.round((entry.wins / entry.played) * 100) : 0
      }))
      .sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.played - a.played;
      });
  }, [currentUserId, matches]);

  const sortedAvailabilityRequests = useMemo(
    () =>
      [...availabilityRequests].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [availabilityRequests]
  );

  async function handleSubmit() {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setSaving(true);
      setMessage(null);
      setError(null);

      const payload = {
        opponent_id: form.opponent_id,
        played_on: form.played_on,
        score_self: Number(form.score_self),
        score_opponent: Number(form.score_opponent),
        notes: form.notes || null
      };

      if (editingMatchId) {
        await updateCasualMatch(editingMatchId, token, payload);
        setMessage("Partido actualizado.");
      } else {
        await createCasualMatch(token, payload);
        setMessage("Partido cargado al historial.");
      }

      setForm(getEmptyForm());
      setEditingMatchId(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el partido");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(match: CasualMatch) {
    if (!currentUserId) return;

    const opponent = getOpponent(match, currentUserId);
    const isPlayerOne = match.player_one_id === currentUserId;

    setEditingMatchId(match.id);
    setForm({
      opponent_id: opponent?.id || "",
      played_on: match.played_on,
      score_self: String(isPlayerOne ? match.score_player_one : match.score_player_two),
      score_opponent: String(
        isPlayerOne ? match.score_player_two : match.score_player_one
      ),
      notes: match.notes || ""
    });
    setMessage(null);
    setError(null);
  }

  async function handleDelete(match: CasualMatch) {
    const confirmed = window.confirm("Vas a borrar este partido del historial.");
    if (!confirmed) return;

    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setSaving(true);
      setMessage(null);
      setError(null);
      await deleteCasualMatch(match.id, token);
      if (editingMatchId === match.id) {
        setEditingMatchId(null);
        setForm(getEmptyForm());
      }
      setMessage("Partido borrado.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el partido");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivateAvailability() {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setSaving(true);
      setMessage(null);
      setError(null);
      await activateMatchAvailability(token, {
        notes: availabilityNote || null
      });
      setMessage(
        "Avisamos a los jugadores de tu misma categoría que estás buscando partido."
      );
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo publicar tu búsqueda de partido"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateAvailability() {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setSaving(true);
      setMessage(null);
      setError(null);
      await deactivateMatchAvailability(token);
      setMessage("Listo. Ya no figuras como disponible para jugar hoy.");
      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo quitar tu búsqueda de partido"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Partidos casuales"
        subtitle="Carga resultados entre jugadores y revisa el historial de enfrentamientos."
      />

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Cargando partidos...</p> : null}

      {unavailable ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Los partidos casuales todavía no están habilitados en la base. Falta correr la
          migración SQL.
        </div>
      ) : null}

      {!loading && !unavailable ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <article className="card p-5">
              <p className="text-sm text-slate-500">Partidos jugados</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">{summary.total}</p>
            </article>
            <article className="card p-5">
              <p className="text-sm text-emerald-700">Victorias</p>
              <p className="mt-2 text-3xl font-bold text-emerald-900">{summary.wins}</p>
            </article>
            <article className="card p-5">
              <p className="text-sm text-rose-700">Derrotas</p>
              <p className="mt-2 text-3xl font-bold text-rose-900">{summary.losses}</p>
            </article>
          </div>

          <section className="card space-y-4 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Busco partido hoy
                </h2>
                <p className="text-sm text-slate-500">
                  Publica que estás disponible y avisamos por mail a jugadores de tu
                  misma categoría.
                </p>
              </div>
              {currentAvailability ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Publicado hoy
                </span>
              ) : null}
            </div>

            {availabilityUnavailable ? (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                La función de búsqueda de partido todavía no está habilitada en la base.
                Falta correr la migración SQL.
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Nota opcional
                    </label>
                    <textarea
                      className="min-h-[100px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={availabilityNote}
                      onChange={(event) => setAvailabilityNote(event.target.value)}
                      placeholder="Ej: Hoy puedo después de las 20 hs."
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {currentAvailability ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleDeactivateAvailability}
                          disabled={saving}
                        >
                          {saving ? "Cerrando..." : "Ya conseguí rival"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-accent"
                          onClick={handleActivateAvailability}
                          disabled={saving}
                        >
                          {saving ? "Publicando..." : "Avisar que busco partido"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Jugadores disponibles en tu categoría
                    </p>
                    {sortedAvailabilityRequests.length ? (
                      <div className="mt-3 space-y-3">
                        {sortedAvailabilityRequests.map((request) => (
                          <article
                            key={request.id}
                            className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <img
                                src={request.profiles?.avatar_url || "/icon-192.png"}
                                alt={request.profiles?.full_name || "Jugador"}
                                className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                              />
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {request.profiles?.full_name || "Sin nombre"}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {request.profiles?.category || "Sin categoría"}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                                  Publicado {formatPublishedAt(request.created_at)}
                                </p>
                                {request.notes ? (
                                  <p className="mt-1 text-sm text-slate-600">
                                    {request.notes}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <a
                              href={`/messages?to=${request.user_id}`}
                              className="btn-secondary text-center"
                            >
                              Escribirle
                            </a>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        Nadie de tu categoría se publicó todavía para hoy.
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="card space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Ranking casual</h2>
              <p className="text-sm text-slate-500">
                Tu resumen de resultados contra cada rival.
              </p>
            </div>

            {ranking.length ? (
              <div className="space-y-3">
                {ranking.slice(0, 6).map((entry, index) => (
                  <article
                    key={entry.player.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                        {index + 1}
                      </span>
                      <img
                        src={entry.player.avatar_url || "/icon-192.png"}
                        alt={entry.player.full_name || "Jugador"}
                        className="h-12 w-12 rounded-full border border-slate-200 object-cover"
                      />
                      <div>
                        <p className="font-semibold text-slate-900">
                          {entry.player.full_name || "Sin nombre"}
                        </p>
                        <p className="text-sm text-slate-500">
                          {entry.player.category || "Sin categoría"} · {entry.played} partido
                          {entry.played === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                        {entry.wins} ganados
                      </span>
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-800">
                        {entry.losses} perdidos
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        {entry.winRate}% efectividad
                      </span>
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                        {entry.pointsFor}-{entry.pointsAgainst}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                El ranking aparece apenas cargues tus primeros partidos.
              </div>
            )}
          </section>

          <section className="card space-y-5 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {editingMatchId ? "Editar partido" : "Cargar nuevo partido"}
                </h2>
                <p className="text-sm text-slate-500">
                  Guarda el resultado para tener historial entre jugadores.
                </p>
              </div>

              {recentOpponents.length ? (
                <div className="flex flex-wrap gap-2">
                  {recentOpponents.map((player) => (
                    <span
                      key={player.id}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                    >
                      {player.full_name || "Sin nombre"}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Rival
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={form.opponent_id}
                  onChange={(event) =>
                    setForm({ ...form, opponent_id: event.target.value })
                  }
                >
                  <option value="">Seleccionar jugador</option>
                  {players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.full_name || "Sin nombre"} ·{" "}
                      {player.category || "Sin categoría"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Fecha
                </label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={form.played_on}
                  onChange={(event) =>
                    setForm({ ...form, played_on: event.target.value })
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Tus games
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={form.score_self}
                  onChange={(event) =>
                    setForm({ ...form, score_self: event.target.value })
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Games rival
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={form.score_opponent}
                  onChange={(event) =>
                    setForm({ ...form, score_opponent: event.target.value })
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Notas
                </label>
                <textarea
                  className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? "Guardando..."
                    : editingMatchId
                      ? "Guardar cambios"
                      : "Cargar partido"}
                </button>
                {editingMatchId ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving}
                    onClick={() => {
                      setEditingMatchId(null);
                      setForm(getEmptyForm());
                    }}
                  >
                    Cancelar edición
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="card space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Historial</h2>
              <p className="text-sm text-slate-500">
                Tus partidos casuales más recientes y resultados entre jugadores.
              </p>
            </div>

            {matches.length ? (
              <div className="space-y-3">
                {matches.map((match) => {
                  const opponent = getOpponent(match, currentUserId);
                  const result = getMatchResult(match, currentUserId);
                  const isCreator = match.created_by === currentUserId;
                  const myScore =
                    match.player_one_id === currentUserId
                      ? match.score_player_one
                      : match.score_player_two;
                  const opponentScore =
                    match.player_one_id === currentUserId
                      ? match.score_player_two
                      : match.score_player_one;

                  return (
                    <article
                      key={match.id}
                      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={opponent?.avatar_url || "/icon-192.png"}
                          alt={opponent?.full_name || "Jugador"}
                          className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-900">
                              {opponent?.full_name || "Sin rival"}
                            </p>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${result.className}`}
                            >
                              {result.label}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500">
                            {opponent?.category || "Sin categoría"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {formatPlayedOn(match.played_on)}
                          </p>
                          {match.notes ? (
                            <p className="mt-1 text-sm text-slate-500">{match.notes}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-start gap-3 md:items-end">
                        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Resultado
                          </p>
                          <p className="mt-1 text-2xl font-black text-slate-950">
                            {myScore} - {opponentScore}
                          </p>
                        </div>
                        {isCreator ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={() => startEdit(match)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                              onClick={() => handleDelete(match)}
                            >
                              Borrar
                            </button>
                          </div>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                            Cargado por el rival
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                Todavía no hay partidos casuales cargados.
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
