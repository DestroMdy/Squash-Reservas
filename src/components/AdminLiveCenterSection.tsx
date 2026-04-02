"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarImage } from "@/components/AvatarImage";
import { hydrateCourtsWithSquoreFeed } from "@/lib/live-squore-feed";
import { LIVE_COURTS } from "@/lib/live-stream";
import {
  fetchAdminLiveCastSettings,
  deleteLivePlayerMapping,
  fetchAdminLiveStream,
  fetchLivePlayerMappings,
  fetchPlayers,
  getSession,
  upsertLivePlayerMapping,
  updateAdminLiveCastSettings,
  updateLiveStream
} from "@/lib/supabase";
import {
  AdminLiveCourtState,
  LiveCastSettings,
  LiveCourtId,
  LivePlayerMapping,
  Profile
} from "@/types/db";

type LiveCourtFormState = {
  title: string;
  description: string;
  banner_url: string;
  youtube_url: string;
  squore_device_id: string;
  squore_mqtt_broker_url: string;
  squore_mqtt_match_topic: string;
  squore_mqtt_change_topic: string;
  starts_at: string;
  scoreboard_delay_seconds: string;
  is_enabled: boolean;
  is_live: boolean;
  tournament_software_post_url: string;
};

type LivePlayerMappingFormState = {
  squore_names: string;
  profile_id: string;
};

function getEmptyLiveCourtForm(): LiveCourtFormState {
  return {
    title: "",
    description: "",
    banner_url: "",
    youtube_url: "",
    squore_device_id: "",
    squore_mqtt_broker_url: "wss://broker.emqx.io:8084/mqtt",
    squore_mqtt_match_topic: "",
    squore_mqtt_change_topic: "",
    starts_at: "",
    scoreboard_delay_seconds: "5",
    is_enabled: true,
    is_live: false,
    tournament_software_post_url: ""
  };
}

function getEmptyPlayerMappingForm(): LivePlayerMappingFormState {
  return {
    squore_names: "",
    profile_id: ""
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
    squore_device_id: stream.squore_device_id || "",
    squore_mqtt_broker_url:
      stream.squore_mqtt_broker_url || "wss://broker.emqx.io:8084/mqtt",
    squore_mqtt_match_topic: stream.squore_mqtt_match_topic || "",
    squore_mqtt_change_topic: stream.squore_mqtt_change_topic || "",
    starts_at: formatDateTimeLocalValue(stream.starts_at),
    scoreboard_delay_seconds: String(stream.scoreboard_delay_seconds ?? 5),
    is_enabled: stream.is_enabled !== false,
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
  const [playerMappings, setPlayerMappings] = useState<LivePlayerMapping[]>([]);
  const [availablePlayers, setAvailablePlayers] = useState<Profile[]>([]);
  const [mappingForm, setMappingForm] = useState<LivePlayerMappingFormState>(
    getEmptyPlayerMappingForm()
  );
  const [savingMapping, setSavingMapping] = useState(false);
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null);
  const [castSettings, setCastSettings] = useState<LiveCastSettings>({
    google_cast_app_id: null,
    receiver_url: null
  });
  const [castAppIdInput, setCastAppIdInput] = useState("");
  const [savingCastSettings, setSavingCastSettings] = useState(false);

  const liveCount = useMemo(
    () =>
      courts.filter(
        (court) => court.stream?.is_enabled !== false && court.stream?.is_live
      ).length,
    [courts]
  );

  const selectablePlayers = useMemo(
    () =>
      [...availablePlayers].sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || "", "es")
      ),
    [availablePlayers]
  );

  const groupedPlayerMappings = useMemo(() => {
    const groupedMappings = new Map<
      string,
      {
        profile_id: string;
        profile_name: string | null;
        avatar_url?: string | null;
        aliases: LivePlayerMapping[];
      }
    >();

    for (const mapping of playerMappings) {
      const key = mapping.profile_id || mapping.id;
      const currentGroup = groupedMappings.get(key);

      if (currentGroup) {
        currentGroup.aliases.push(mapping);
        continue;
      }

      groupedMappings.set(key, {
        profile_id: mapping.profile_id,
        profile_name: mapping.profile_name,
        avatar_url: mapping.avatar_url,
        aliases: [mapping]
      });
    }

    return Array.from(groupedMappings.values())
      .map((group) => ({
        ...group,
        aliases: [...group.aliases].sort((a, b) =>
          a.squore_name.localeCompare(b.squore_name, "es")
        )
      }))
      .sort((a, b) =>
        (a.profile_name || "").localeCompare(b.profile_name || "", "es")
      );
  }, [playerMappings]);

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

    const [result, players, mappings, castConfig] = await Promise.all([
      fetchAdminLiveStream(token),
      fetchPlayers(token),
      fetchLivePlayerMappings(token),
      fetchAdminLiveCastSettings(token)
    ]);
    const hydratedCourts = await hydrateCourtsWithSquoreFeed(result.courts);
    applyCourts(hydratedCourts);
    setAvailablePlayers(players || []);
    setPlayerMappings(mappings || []);
    setCastSettings(castConfig);
    setCastAppIdInput(castConfig.google_cast_app_id || "");
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
          scoreboard_delay_seconds: Number(form.scoreboard_delay_seconds || 5),
          is_enabled: form.is_enabled,
          is_live: form.is_live,
          tournament_software_post_url: form.tournament_software_post_url || null,
          squore_device_id: form.squore_device_id || null,
        squore_mqtt_broker_url: form.squore_mqtt_broker_url || null,
        squore_mqtt_match_topic: form.squore_mqtt_match_topic || null,
        squore_mqtt_change_topic: form.squore_mqtt_change_topic || null
      });

      const hydratedCourts = await hydrateCourtsWithSquoreFeed(result.courts);
      applyCourts(hydratedCourts);
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
    const court = courts.find((currentCourt) => currentCourt.id === courtId) || null;
    const courtLabel = court?.label || "esta cancha";
    const confirmed = window.confirm(
      `Vas a desactivar ${courtLabel}. Dejara de mostrarse al publico, pero la configuracion va a quedar guardada.`
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

        if (!court?.stream) {
          throw new Error("No hay configuracion guardada para esta cancha.");
        }

        const savedForm = mapStreamToForm(court.stream);
        const result = await updateLiveStream(token, {
          court_id: courtId,
          title: savedForm.title,
          description: savedForm.description || null,
          banner_url: savedForm.banner_url || null,
          youtube_url: savedForm.youtube_url,
          starts_at: savedForm.starts_at
            ? new Date(savedForm.starts_at).toISOString()
            : null,
          scoreboard_delay_seconds: Number(savedForm.scoreboard_delay_seconds || 5),
          is_enabled: false,
          is_live: false,
          tournament_software_post_url:
            savedForm.tournament_software_post_url || null,
          squore_device_id: savedForm.squore_device_id || null,
          squore_mqtt_broker_url: savedForm.squore_mqtt_broker_url || null,
          squore_mqtt_match_topic: savedForm.squore_mqtt_match_topic || null,
          squore_mqtt_change_topic: savedForm.squore_mqtt_change_topic || null
        });

        const hydratedCourts = await hydrateCourtsWithSquoreFeed(result.courts);
        applyCourts(hydratedCourts);
        setMessage(`${courtLabel} desactivada.`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo desactivar la cancha del centro en vivo"
        );
      } finally {
        setClearingCourtId(null);
    }
  }

  async function handleSavePlayerMapping() {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesion");
      }

      if (!mappingForm.squore_names.trim() || !mappingForm.profile_id) {
        throw new Error("Debes indicar al menos un alias de Squore y el jugador de la app.");
      }

      setSavingMapping(true);
      setMessage(null);
      setError(null);

      const result = await upsertLivePlayerMapping(token, {
        squore_names: mappingForm.squore_names
          .split(/[\r\n,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
        profile_id: mappingForm.profile_id
      });

      setPlayerMappings(result.mappings);
      setMappingForm(getEmptyPlayerMappingForm());
      setMessage(
        result.saved_count > 1
          ? `${result.saved_count} alias guardados.`
          : "Alias guardado."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la vinculacion manual"
      );
    } finally {
      setSavingMapping(false);
    }
  }

  async function handleDeletePlayerMapping(mappingId: string) {
    const confirmed = window.confirm(
      "Vas a borrar esta vinculacion manual entre Squore y el perfil del jugador."
    );

    if (!confirmed) {
      return;
    }

    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesion");
      }

      setDeletingMappingId(mappingId);
      setMessage(null);
      setError(null);

      const mappings = await deleteLivePlayerMapping(token, mappingId);
      setPlayerMappings(mappings);
      setMessage("Vinculacion manual eliminada.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo borrar la vinculacion manual"
      );
    } finally {
      setDeletingMappingId(null);
    }
  }

  async function handleSaveCastSettings() {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesion");
      }

      setSavingCastSettings(true);
      setMessage(null);
      setError(null);

      const result = await updateAdminLiveCastSettings(token, {
        google_cast_app_id: castAppIdInput || null
      });

      setCastSettings(result);
      setCastAppIdInput(result.google_cast_app_id || "");
      setMessage(
        result.google_cast_app_id
          ? "Google Cast configurado."
          : "Google Cast limpiado."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la configuracion de Google Cast"
      );
    } finally {
      setSavingCastSettings(false);
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

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Google Cast / TV
            </p>
            <h3 className="mt-2 text-lg font-bold text-slate-950">
              Receiver propio con video y marcador
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Registra esta URL en Google Cast Console como Custom Web Receiver y pega
              abajo el App ID para habilitar el boton de TV en la pagina publica.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
            {castSettings.google_cast_app_id ? "Configurado" : "Pendiente"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px_auto] lg:items-end">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">URL del receiver</span>
            <input
              type="text"
              value={castSettings.receiver_url || ""}
              readOnly
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-700">App ID de Google Cast</span>
            <input
              type="text"
              maxLength={8}
              value={castAppIdInput}
              onChange={(event) =>
                setCastAppIdInput(event.target.value.toUpperCase())
              }
              placeholder="Ej. A1B2C3D4"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-500"
            />
          </label>
          <button
            type="button"
            onClick={handleSaveCastSettings}
            disabled={savingCastSettings}
            className="btn-secondary whitespace-nowrap"
          >
            {savingCastSettings ? "Guardando..." : "Guardar Cast"}
          </button>
        </div>
      </div>

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
                      court.stream?.is_enabled === false
                        ? "bg-slate-200 text-slate-700"
                        : court.stream?.is_live
                        ? "bg-red-100 text-red-700"
                        : court.stream
                          ? "bg-orange-100 text-orange-700"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {court.stream?.is_enabled === false
                      ? "Desactivada"
                      : court.stream?.is_live
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
                        Último POST recibido:{" "}
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
                      <p>
                        Device Squore:{" "}
                        <span className="font-medium">
                          {court.stream?.squore_device_id || "No configurado"}
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
                      Device Unique Id de la tablet Squore
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.squore_device_id}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            squore_device_id: event.target.value
                          }
                        }))
                      }
                      placeholder="Ej: XFQE3A"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Opcional. Si lo cargas, el vivo puede leer el partido actual directo desde el feed de esa tablet, aunque el PostResult automatico no dispare.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Broker MQTT de Squore
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.squore_mqtt_broker_url}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            squore_mqtt_broker_url: event.target.value
                          }
                        }))
                      }
                      placeholder="wss://broker.emqx.io:8084/mqtt"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Opcional. Si configuras MQTT, el vivo puede actualizar el score punto a punto.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Topic MQTT del partido
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.squore_mqtt_match_topic}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            squore_mqtt_match_topic: event.target.value
                          }
                        }))
                      }
                      placeholder="Pega el Publish Match Topic de la tablet"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Topic MQTT de cambios
                    </label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.squore_mqtt_change_topic}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            squore_mqtt_change_topic: event.target.value
                          }
                        }))
                      }
                      placeholder="Pega el Publish Change Topic de la tablet"
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
                      Demora del marcador respecto del video
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      step={1}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={form.scoreboard_delay_seconds}
                      onChange={(event) =>
                        setForms((current) => ({
                          ...current,
                          [court.id]: {
                            ...current[court.id],
                            scoreboard_delay_seconds: event.target.value
                          }
                        }))
                      }
                      placeholder="5"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      En segundos. Sirve para acompaÃ±ar el delay real de YouTube y que el score no se adelante al video.
                    </p>
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
                        checked={form.is_enabled}
                        onChange={(event) =>
                          setForms((current) => ({
                            ...current,
                            [court.id]: {
                              ...current[court.id],
                              is_enabled: event.target.checked,
                              is_live: event.target.checked
                                ? current[court.id].is_live
                                : false
                            }
                          }))
                        }
                      />
                      Mostrar {court.label.toLowerCase()} en la app
                    </label>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.is_live}
                        disabled={!form.is_enabled}
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
                    {court.stream?.is_enabled === false ? (
                      <button
                        type="button"
                        className="rounded-xl border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() =>
                          setForms((current) => ({
                            ...current,
                            [court.id]: {
                              ...current[court.id],
                              is_enabled: true
                            }
                          }))
                        }
                        disabled={isSaving || isClearing}
                      >
                        Reactivar en formulario
                      </button>
                    ) : null}
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

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Vinculacion manual de jugadores Squore
            </h3>
            <p className="text-sm text-slate-500">
              Si el nombre que llega desde Squore no coincide exactamente con el perfil, puedes enlazarlo aca para mostrar bien nombre y avatar en el vivo.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {playerMappings.length} vinculacion{playerMappings.length === 1 ? "" : "es"}
          </span>
        </div>

        <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1.2fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Alias o nombres que manda Squore
            </label>
            <textarea
              className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              value={mappingForm.squore_names}
              onChange={(event) =>
                setMappingForm((current) => ({
                  ...current,
                  squore_names: event.target.value
                }))
              }
              placeholder={`Ej:\nAgustin Rivero\nA. Rivero\nRivero, Agustin`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Puedes cargar varios alias separados por coma o salto de linea.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Jugador de la app
            </label>
            <select
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              value={mappingForm.profile_id}
              onChange={(event) =>
                setMappingForm((current) => ({
                  ...current,
                  profile_id: event.target.value
                }))
              }
            >
              <option value="">Seleccionar jugador</option>
              {selectablePlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.full_name || "Sin nombre"}
                  {player.category ? ` · ${player.category}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              className="btn-primary whitespace-nowrap"
              onClick={handleSavePlayerMapping}
              disabled={savingMapping}
            >
              {savingMapping ? "Guardando..." : "Guardar vinculacion"}
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {groupedPlayerMappings.length ? (
            groupedPlayerMappings.map((group) => (
              <div
                key={group.profile_id}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarImage
                      src={group.avatar_url}
                      alt={group.profile_name || "Jugador"}
                      size={44}
                      className="h-11 w-11 rounded-full border border-slate-200 object-cover shadow-sm"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Jugador vinculado
                      </p>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {group.profile_name || "Perfil sin nombre"}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                    {group.aliases.length} alias{group.aliases.length === 1 ? "" : "es"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {group.aliases.map((mapping) => (
                    <span
                      key={mapping.id}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    >
                      <span>{mapping.squore_name}</span>
                      <button
                        type="button"
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 transition hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => handleDeletePlayerMapping(mapping.id)}
                        disabled={deletingMappingId === mapping.id}
                      >
                        {deletingMappingId === mapping.id ? "..." : "x"}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              Todavia no cargaste alias manuales. Solo hace falta si Squore usa nombres distintos a los perfiles del club.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
