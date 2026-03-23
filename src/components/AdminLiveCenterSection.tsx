"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LIVE_COURTS } from "@/lib/live-stream";
import {
  clearLiveStream,
  fetchAdminLiveStream,
  getSession,
  updateLiveStream
} from "@/lib/supabase";
import { AdminLiveCourtState, LiveCourtId } from "@/types/db";

type LiveCourtFormState = {
  title: string;
  description: string;
  banner_url: string;
  youtube_url: string;
  starts_at: string;
  is_live: boolean;
  tournament_software_post_url: string;
};

function getEmptyLiveCourtForm(): LiveCourtFormState {
  return {
    title: "",
    description: "",
    banner_url: "",
    youtube_url: "",
    starts_at: "",
    is_live: false,
    tournament_software_post_url: ""
  };
}

function formatDateTimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function mapStreamToForm(
  stream: AdminLiveCourtState["stream"]
): LiveCourtFormState {
  if (!stream) {
    return getEmptyLiveCourtForm();
  }

  return {
    title: stream.title,
    description: stream.description || "",
    banner_url: stream.banner_url || "",
    youtube_url: stream.youtube_url,
    starts_at: formatDateTimeLocalValue(stream.starts_at),
    is_live: stream.is_live,
    tournament_software_post_url: stream.tournament_software_post_url || ""
  };
}

function buildEmptyCourt(courtId: LiveCourtId, label: string): AdminLiveCourtState {
  return {
    id: courtId,
    label,
    stream: null,
    scoreboard: null,
    squore_post_url: null
  };
}

function normalizeCourts(courts?: AdminLiveCourtState[]) {
  return LIVE_COURTS.map(
    (court) =>
      courts?.find((currentCourt) => currentCourt.id === court.id) ||
      buildEmptyCourt(court.id, court.label)
  );
}

function buildForms(courts: AdminLiveCourtState[]) {
  return courts.reduce<Record<LiveCourtId, LiveCourtFormState>>((acc, court) => {
    acc[court.id] = mapStreamToForm(court.stream);
    return acc;
  }, {
    "court-1": getEmptyLiveCourtForm(),
    "court-2": getEmptyLiveCourtForm()
  });
}

function formatStatusTime(value: string | null | undefined) {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function AdminLiveCenterSection() {
  const [courts, setCourts] = useState<AdminLiveCourtState[]>(
    normalizeCourts()
  );
  const [forms, setForms] = useState<Record<LiveCourtId, LiveCourtFormState>>(
    buildForms(normalizeCourts())
  );
  const [loading, setLoading] = useState(true);
  const [savingCourtId, setSavingCourtId] = useState<LiveCourtId | null>(null);
  const [clearingCourtId, setClearingCourtId] = useState<LiveCourtId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const liveCount = useMemo(
    () => courts.filter((court) => court.stream?.is_live).length,
    [courts]
  );

  function applyCourts(nextCourts?: AdminLiveCourtState[]) {
    const normalized = normalizeCourts(nextCourts);
    setCourts(normalized);
    setForms(buildForms(normalized));
  }

  const loadLiveCenter = useCallback(async () => {
    const token = getSession()?.access_token;
    if (!token) {
      throw new Error("Debes iniciar sesion");
    }

    const result = await fetchAdminLiveStream(token);
    applyCourts(result.courts);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        await loadLiveCenter();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar el centro en vivo"
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [loadLiveCenter]);

  async function handleSave(courtId: LiveCourtId) {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesion");
      }

      const form = forms[courtId];
      setSavingCourtId(courtId);
      setMessage(null);
      setError(null);

      const result = await updateLiveStream(token, {
        court_id: courtId,
        title: form.title,
        description: form.description || null,
        banner_url: form.banner_url || null,
        youtube_url: form.youtube_url,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        is_live: form.is_live,
        tournament_software_post_url: form.tournament_software_post_url || null
      });

      applyCourts(result.courts);
      setMessage(`${courts.find((court) => court.id === courtId)?.label || "La cancha"} guardada.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la cancha del centro en vivo"
      );
    } finally {
      setSavingCourtId(null);
    }
  }

  async function handleClear(courtId: LiveCourtId) {
    const courtLabel = courts.find((court) => court.id === courtId)?.label || "esta cancha";
    const confirmed = window.confirm(
      `Vas a desactivar ${courtLabel}. Los usuarios dejaran de verla en el centro en vivo.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesion");
      }

      setClearingCourtId(courtId);
      setMessage(null);
      setError(null);

      const result = await clearLiveStream(token, courtId);
      applyCourts(result.courts);
      setMessage(`${courtLabel} desactivada.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo limpiar la cancha del centro en vivo"
      );
    } finally {
      setClearingCourtId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Centro en vivo</h2>
          <p className="text-sm text-slate-500">
            Configura dos transmisiones simultaneas, una por cancha, con marcador de Squore y reenvio opcional a Tournament Software.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {liveCount > 0 ? `${liveCount}/2 en vivo` : "2 canchas"}
          </span>
          <a
            href="/live"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary whitespace-nowrap"
          >
            Ver pagina publica
          </a>
        </div>
      </div>

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando centro en vivo...</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {courts.map((court) => {
          const form = forms[court.id];
          const isSaving = savingCourtId === court.id;
          const isClearing = clearingCourtId === court.id;

          return (
            <article
              key={court.id}
              className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {court.label}
                  </p>
                  <h3 className="mt-2 text-xl font-bold text-slate-950">
                    {court.stream?.title || "Sin transmision configurada"}
                  </h3>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    court.stream?.is_live
                      ? "bg-red-100 text-red-700"
                      : court.stream
                        ? "bg-orange-100 text-orange-700"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {court.stream?.is_live
                    ? "En vivo ahora"
                    : court.stream
                      ? "Programada"
                      : "Off"}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-700">
                    Integracion Squore
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Pega este endpoint en <strong>PostResult</strong> de la tablet de {court.label.toLowerCase()}.
                  </p>
                  <div className="mt-3 rounded-xl border border-orange-200 bg-white px-3 py-3">
                    <p className="break-all font-mono text-xs text-slate-700">
                      {court.squore_post_url || "Guardando..."}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Si completas Tournament Software abajo, este mismo payload se reenvia automaticamente.
                  </p>
                </div>

                <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Estado técnico
                    </p>
                    <div className="space-y-2 text-sm text-slate-700">
                      <p>
                        YouTube:{" "}
                        <span className="font-medium">
                          {court.stream?.youtube_url ? "Configurado" : "Pendiente"}
                        </span>
                      </p>
                      <p>
                        Último score:{" "}
                        <span className="font-medium">
                          {formatStatusTime(
                            court.ingest_status?.last_score_received_at || null
                          )}
                        </span>
                      </p>
                      <p>
                        Último reenvío:{" "}
                        <span className="font-medium">
                          {court.stream?.tournament_software_post_url
                            ? formatStatusTime(
                                court.ingest_status?.last_forwarded_at || null
                              )
                            : "No configurado"}
                        </span>
                      </p>
                      <p>
                        Match actual:{" "}
                        <span className="font-medium">
                          {court.ingest_status?.latest_payload_summary || "Sin datos"}
                        </span>
                      </p>
                    </div>
                    {court.ingest_status?.last_forward_error ? (
                      <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                        Error de reenvío: {court.ingest_status.last_forward_error}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Overlay para streaming
                    </p>
                    <p className="text-sm text-slate-600">
                      Usa esta URL como Browser Source en OBS si quieres superponer solo el marcador.
                    </p>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="break-all font-mono text-xs text-slate-700">
                        {court.overlay_url || "Disponible al guardar la cancha"}
                      </p>
                    </div>
                    {court.overlay_url ? (
                      <a
                        href={court.overlay_url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary inline-flex"
                      >
                        Abrir overlay
                      </a>
                    ) : null}
                  </div>
                </div>

                {court.scoreboard ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Ultimo marcador recibido
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {court.scoreboard.player_one_name} vs {court.scoreboard.player_two_name}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {court.scoreboard.result || court.scoreboard.game_scores || "Sin resultado final"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(court.scoreboard.updated_at).toLocaleString("es-AR")}
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Titulo
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.title}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            title: event.target.value
                          }
                        }))
                      }
                      placeholder={`Ej: ${court.label} - Fecha del Patagonico`}
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Inicio programado
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.starts_at}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            starts_at: event.target.value
                          }
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Link de YouTube
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.youtube_url}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            youtube_url: event.target.value
                          }
                        }))
                      }
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      URL PostResult de Tournament Software
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.tournament_software_post_url}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            tournament_software_post_url: event.target.value
                          }
                        }))
                      }
                      placeholder="https://.../TournamentSoftware"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Opcional. Si hoy Squore ya postea a Tournament Software, pega esa URL aca y la app la reenvia por vos.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Banner / afiche
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.banner_url}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            banner_url: event.target.value
                          }
                        }))
                      }
                      placeholder="https://.../afiche.jpg"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Descripcion
                    </label>
                    <textarea
                      className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.description}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            description: event.target.value
                          }
                        }))
                      }
                      placeholder="Opcional"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.is_live}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            is_live: event.target.checked
                          }
                        }))
                      }
                    />
                    Marcar {court.label.toLowerCase()} como en vivo ahora
                  </label>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleSave(court.id)}
                      disabled={isSaving || isClearing}
                    >
                      {isSaving ? "Guardando..." : "Guardar cancha"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: getEmptyLiveCourtForm()
                        }))
                      }
                      disabled={isSaving || isClearing}
                    >
                      Limpiar formulario
                    </button>
                    {court.stream ? (
                      <button
                        type="button"
                        className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleClear(court.id)}
                        disabled={isSaving || isClearing}
                      >
                        {isClearing ? "Limpiando..." : "Desactivar cancha"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
