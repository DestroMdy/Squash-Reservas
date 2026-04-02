"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarImage } from "@/components/AvatarImage";
import { SectionTitle } from "@/components/SectionTitle";
import { startSquoreMqttLiveSync } from "@/lib/live-squore-mqtt";
import { hydrateCourtsWithSquoreFeed } from "@/lib/live-squore-feed";
import {
  fetchLiveCenterStatus,
  getSession,
  sendLiveComment
} from "@/lib/supabase";
import { LiveComment, LiveCourtState, LiveScoreboard } from "@/types/db";

const LIVE_REFRESH_MS = 3_000;
const DEFAULT_SCOREBOARD_DELAY_MS = 5_000;
type SupportedOrientationLock = "landscape" | "portrait" | "natural";

function mergeRealtimeScoreboard(
  currentScoreboard: LiveScoreboard | null,
  realtimeScoreboard: LiveScoreboard | null | undefined
) {
  if (!realtimeScoreboard) {
    return currentScoreboard;
  }

  return realtimeScoreboard;
}

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

function formatCommentTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function lockLandscapeOrientation() {
  if (typeof screen === "undefined" || !screen.orientation) {
    return;
  }

  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: SupportedOrientationLock) => Promise<void>;
  };

  if (typeof orientation.lock !== "function") {
    return;
  }

  try {
    await orientation.lock("landscape");
  } catch {
    // Some browsers/apps reject orientation lock outside supported fullscreen contexts.
  }
}

function unlockScreenOrientation() {
  if (typeof screen === "undefined" || !screen.orientation) {
    return;
  }

  const orientation = screen.orientation as ScreenOrientation & {
    unlock?: () => void;
  };

  if (typeof orientation.unlock !== "function") {
    return;
  }

  try {
    orientation.unlock();
  } catch {
    // Ignore unlock failures on browsers that partially implement the API.
  }
}

function getCompactPlayerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return value;
  }

  const preferred = parts[0] || value;
  return preferred.length > 12 ? `${preferred.slice(0, 12)}…` : preferred;
}

function normalizeParticipantName(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseGameScores(
  gameScores: string | null,
  playerOneName: string,
  playerTwoName: string
) {
  if (!gameScores) {
    return [];
  }

  return gameScores
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment, index) => {
      const match = segment.match(/(-?\d+)\s*-\s*(-?\d+)/);
      if (!match) {
        return null;
      }

      const playerOneScore = Number(match[1]);
      const playerTwoScore = Number(match[2]);
      const winnerSide =
        playerOneScore === playerTwoScore
          ? null
          : playerOneScore > playerTwoScore
            ? 1
            : 2;

      return {
        key: `game-${index + 1}`,
        label: `G${index + 1}`,
        score: `${playerOneScore}-${playerTwoScore}`,
        winnerSide,
        winnerLabel:
          winnerSide === 1
            ? getCompactPlayerName(playerOneName)
            : winnerSide === 2
              ? getCompactPlayerName(playerTwoName)
              : "Igualado"
      };
    })
    .filter(Boolean) as Array<{
    key: string;
    label: string;
    score: string;
    winnerSide: 1 | 2 | null;
    winnerLabel: string;
  }>;
}

function resolveWinnerSide(
  scoreboard: LiveScoreboard,
  parsedGames: ReturnType<typeof parseGameScores>
) {
  if (scoreboard.winner_side === 1 || scoreboard.winner_side === 2) {
    return scoreboard.winner_side;
  }

  const normalizedWinnerName = normalizeParticipantName(scoreboard.winner_name);
  const normalizedPlayerOne = normalizeParticipantName(scoreboard.player_one_name);
  const normalizedPlayerTwo = normalizeParticipantName(scoreboard.player_two_name);

  if (normalizedWinnerName) {
    if (
      normalizedWinnerName === normalizedPlayerOne ||
      normalizedWinnerName.includes(normalizedPlayerOne)
    ) {
      return 1;
    }

    if (
      normalizedWinnerName === normalizedPlayerTwo ||
      normalizedWinnerName.includes(normalizedPlayerTwo)
    ) {
      return 2;
    }
  }

  if (
    scoreboard.current_game_points_player_one == null &&
    scoreboard.current_game_points_player_two == null
  ) {
    const lastCompletedGame = parsedGames.at(-1);
    if (lastCompletedGame?.winnerSide === 1 || lastCompletedGame?.winnerSide === 2) {
      return lastCompletedGame.winnerSide;
    }
  }

  return null;
}

function LiveScoreOverlay({
  scoreboard,
  expanded
}: {
  scoreboard: LiveScoreboard;
  expanded: boolean;
}) {
  const currentPointsLabel =
    scoreboard.current_game_points_player_one !== null &&
    scoreboard.current_game_points_player_one !== undefined &&
    scoreboard.current_game_points_player_two !== null &&
    scoreboard.current_game_points_player_two !== undefined
      ? `${scoreboard.current_game_points_player_one}-${scoreboard.current_game_points_player_two}`
      : null;
  const parsedGames = parseGameScores(
    scoreboard.game_scores || null,
    scoreboard.player_one_name,
    scoreboard.player_two_name
  );
  const effectiveWinnerSide = resolveWinnerSide(scoreboard, parsedGames);
  const gamesToDisplay =
    currentPointsLabel !== null &&
    !effectiveWinnerSide &&
    currentPointsLabel &&
    parsedGames.at(-1)?.score === currentPointsLabel
      ? parsedGames.slice(0, -1)
      : parsedGames;
  const winnerLabel =
    effectiveWinnerSide === 1
      ? getCompactPlayerName(scoreboard.player_one_name)
      : effectiveWinnerSide === 2
        ? getCompactPlayerName(scoreboard.player_two_name)
        : null;
  const hasCurrentGamePoints = currentPointsLabel !== null && !effectiveWinnerSide;
  const gameColumns = gamesToDisplay.map((game) => {
    const [playerOneScore = "-", playerTwoScore = "-"] = game.score.split("-");
    return {
      key: game.key,
      label: game.label,
      playerOneScore,
      playerTwoScore
    };
  });

  if (expanded) {
    return (
      <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 sm:left-4 sm:top-4">
        <div className="w-[min(18.5rem,calc(100vw-1rem))] rounded-xl border border-white/10 bg-slate-950/58 px-2 py-1.5 text-white shadow-2xl backdrop-blur-md sm:w-[21rem]">
          <div className="flex items-center justify-end">
            {scoreboard.result ? (
              <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                Games {scoreboard.result}
              </span>
            ) : null}
          </div>

          <div className="mt-1 space-y-1">
            <div className="flex items-center gap-1 pl-[4.85rem] text-[8px] font-medium uppercase tracking-[0.08em] text-white/45 sm:pl-[5.35rem]">
              {gameColumns.map((game) => (
                <span
                  key={`${game.key}-label`}
                  className="flex h-4 min-w-[1.7rem] items-center justify-center rounded bg-white/5 px-1"
                >
                  {game.label}
                </span>
              ))}
              <span
                className={`flex h-4 min-w-[2rem] items-center justify-center rounded px-1 ${
                  hasCurrentGamePoints
                    ? "bg-orange-500/15 text-orange-200"
                    : "bg-emerald-500/15 text-emerald-200"
                }`}
              >
                {hasCurrentGamePoints ? "Act" : "Fin"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="w-[4.6rem] truncate text-[10px] font-semibold leading-none sm:w-[5.1rem] sm:text-[11px]">
                {getCompactPlayerName(scoreboard.player_one_name)}
              </span>
              {gameColumns.map((game) => (
                <span
                  key={`${game.key}-player-one`}
                  className="flex h-5 min-w-[1.7rem] items-center justify-center rounded-md bg-white/10 px-1 text-[10px] font-semibold leading-none text-white/90"
                >
                  {game.playerOneScore}
                </span>
              ))}
              <span
                className={`flex h-5 min-w-[2rem] items-center justify-center rounded-md px-1 text-[10px] font-bold leading-none ${
                  hasCurrentGamePoints
                    ? "bg-white/14 text-white"
                    : effectiveWinnerSide === 1
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/8 text-white/45"
                }`}
              >
                {hasCurrentGamePoints
                  ? scoreboard.current_game_points_player_one
                  : effectiveWinnerSide === 1
                    ? "W"
                    : "-"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <span className="w-[4.6rem] truncate text-[10px] font-semibold leading-none sm:w-[5.1rem] sm:text-[11px]">
                {getCompactPlayerName(scoreboard.player_two_name)}
              </span>
              {gameColumns.map((game) => (
                <span
                  key={`${game.key}-player-two`}
                  className="flex h-5 min-w-[1.7rem] items-center justify-center rounded-md bg-white/10 px-1 text-[10px] font-semibold leading-none text-white/90"
                >
                  {game.playerTwoScore}
                </span>
              ))}
              <span
                className={`flex h-5 min-w-[2rem] items-center justify-center rounded-md px-1 text-[10px] font-bold leading-none ${
                  hasCurrentGamePoints
                    ? "bg-white/14 text-white"
                    : effectiveWinnerSide === 2
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-white/8 text-white/45"
                }`}
              >
                {hasCurrentGamePoints
                  ? scoreboard.current_game_points_player_two
                  : effectiveWinnerSide === 2
                    ? "W"
                    : "-"}
              </span>
            </div>

            {!hasCurrentGamePoints && winnerLabel ? (
              <div className="flex justify-end pt-0.5">
                <span className="rounded-full bg-emerald-500/18 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
                  Gano {winnerLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-3">
      <div className="mx-auto max-w-5xl">
        <div
          className="ml-0 mr-auto max-w-md rounded-2xl border border-white/10 bg-slate-950/58 px-2.5 py-2 text-white shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between gap-1.5">
            <p className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-orange-300">
              En vivo
            </p>
            {scoreboard.result ? (
              <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                {hasCurrentGamePoints ? `Games ${scoreboard.result}` : scoreboard.result}
              </span>
            ) : null}
          </div>

          <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
            <div className="flex min-w-0 items-center gap-1">
              <AvatarImage
                src={scoreboard.player_one_avatar_url}
                alt={scoreboard.player_one_name}
                size={expanded ? 18 : 28}
                className="h-[18px] w-[18px] shrink-0 rounded-full border border-white/20 object-cover shadow-md"
              />
              <p className="truncate text-[10px] font-semibold leading-tight sm:text-[11px]">
                {getCompactPlayerName(scoreboard.player_one_name)}
              </p>
            </div>

            <div className="min-w-[2.95rem] shrink-0 rounded-lg bg-white/10 px-1.5 py-0.5 text-center">
              <p className="text-[7px] uppercase tracking-[0.1em] text-white/55">
                {hasCurrentGamePoints ? "Punto" : "Games"}
              </p>
              <p className="mt-0.5 text-[11px] font-bold leading-none text-white sm:text-xs">
                {hasCurrentGamePoints ? currentPointsLabel : scoreboard.game_scores || "-"}
              </p>
            </div>

            <div className="flex min-w-0 items-center justify-end gap-1">
              <p className="truncate text-[10px] font-semibold leading-tight sm:text-[11px]">
                {getCompactPlayerName(scoreboard.player_two_name)}
              </p>
              <AvatarImage
                src={scoreboard.player_two_avatar_url}
                alt={scoreboard.player_two_name}
                size={expanded ? 18 : 28}
                className="h-[18px] w-[18px] shrink-0 rounded-full border border-white/20 object-cover shadow-md"
              />
            </div>
          </div>

          {gamesToDisplay.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {gamesToDisplay.map((game) => (
                <span
                  key={game.key}
                  className="rounded-md bg-white/10 px-1 py-0.5 text-[8px] font-medium leading-none text-white/90 sm:text-[9px]"
                >
                  <span className="text-white/55">{game.label}</span>{" "}
                  <span className="font-semibold">{game.score}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LiveCommentsSection({
  court,
  authenticatedUserId,
  onRefresh
}: {
  court: LiveCourtState;
  authenticatedUserId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comments = court.comments || [];

  async function handleSubmit() {
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    try {
      setSending(true);
      setError(null);
      await sendLiveComment(
        court.id,
        trimmedBody,
        getSession()?.access_token || undefined
      );
      setBody("");
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo enviar el comentario del vivo."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5">
      {authenticatedUserId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Deja tu comentario
          </label>
          <textarea
            className="min-h-[88px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-500"
            placeholder="Escribe algo sobre el partido, el punto o la transmision..."
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 280))}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{body.trim().length}/280</p>
            <button
              type="button"
              onClick={handleSubmit}
              className="btn-accent"
              disabled={sending || !body.trim()}
            >
              {sending ? "Enviando..." : "Comentar el vivo"}
            </button>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4">
          <p className="text-sm text-slate-600">
            Inicia sesion y completa tu perfil para comentar el vivo.
          </p>
          <div className="mt-3">
            <Link href="/login" className="btn-secondary">
              Ingresar para comentar
            </Link>
          </div>
        </div>
      )}

      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {comments.length ? (
          comments.map((comment) => (
            <article
              key={comment.id}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <AvatarImage
                  src={comment.avatar_url}
                  alt={comment.full_name}
                  size={40}
                  className="h-10 w-10 rounded-full border border-slate-200 object-cover shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {comment.full_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatCommentTime(comment.created_at)}
                    </p>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">
                    {comment.body}
                  </p>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
            Todavia no hay comentarios en {court.label.toLowerCase()}.
          </div>
        )}
      </div>
    </section>
  );
}

function LiveCourtBroadcastCard({
  court,
  authenticatedUserId,
  onRefresh
}: {
  court: LiveCourtState;
  authenticatedUserId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const stream = court.stream;
  const scoreboard = court.scoreboard;
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const scoreboardDelayMs = Math.max(
    0,
    (stream?.scoreboard_delay_seconds ?? 5) * 1000
  );
  const [visibleScoreboard, setVisibleScoreboard] =
    useState<LiveScoreboard | null>(scoreboard);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const isExpanded = isFullscreen || isFocusMode;
  const parsedGames = useMemo(
    () =>
      parseGameScores(
        visibleScoreboard?.game_scores || null,
        visibleScoreboard?.player_one_name || "",
        visibleScoreboard?.player_two_name || ""
      ),
    [
      visibleScoreboard?.game_scores,
      visibleScoreboard?.player_one_name,
      visibleScoreboard?.player_two_name
    ]
  );
  const hasVisibleCurrentGamePoints =
    visibleScoreboard?.current_game_points_player_one !== null &&
    visibleScoreboard?.current_game_points_player_one !== undefined &&
    visibleScoreboard?.current_game_points_player_two !== null &&
    visibleScoreboard?.current_game_points_player_two !== undefined &&
    !visibleScoreboard?.winner_side;

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

  useEffect(() => {
    if (!isFocusMode) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isFocusMode]);

  useEffect(() => {
    if (!isFullscreen && !isFocusMode) {
      unlockScreenOrientation();
      return;
    }

    void lockLandscapeOrientation();

    return () => {
      unlockScreenOrientation();
    };
  }, [isFocusMode, isFullscreen]);

  async function handleEnterExpandedMode() {
    const container = fullscreenContainerRef.current;

    if (container && document.fullscreenEnabled && container.requestFullscreen) {
      try {
        await container.requestFullscreen();
        return;
      } catch {
        setIsFullscreen(false);
      }
    }

    setIsFocusMode(true);
  }

  async function handleExitExpandedMode() {
    if (isFocusMode) {
      unlockScreenOrientation();
      setIsFocusMode(false);
      return;
    }

    if (!document.fullscreenElement) {
      unlockScreenOrientation();
      return;
    }

  try {
      await document.exitFullscreen();
    } catch {
      unlockScreenOrientation();
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
    <>
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

              {visibleScoreboard && isExpanded ? (
                <LiveScoreOverlay
                  scoreboard={visibleScoreboard}
                  expanded={isExpanded}
                />
              ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
              <div className="mx-auto flex max-w-5xl items-start justify-between gap-3">
                {!isExpanded ? (
                  <span className="rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                    {court.label}
                  </span>
                ) : (
                  <span />
                )}
                {isFullscreen ? (
                  <button
                    type="button"
                    onClick={handleExitExpandedMode}
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
              onClick={isExpanded ? handleExitExpandedMode : handleEnterExpandedMode}
              className="btn-secondary"
            >
              {isExpanded
                ? "Salir de pantalla completa"
                : "Pantalla completa con marcador"}
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
          <section className="mt-4 rounded-[1.6rem] border border-orange-200 bg-orange-50 p-3.5 shadow-sm sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
                  Marcador automatico
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Actualizado:{" "}
                  {new Date(visibleScoreboard.updated_at).toLocaleString("es-AR")}
                </p>
              </div>
              {visibleScoreboard.result ? (
                <span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">
                  {hasVisibleCurrentGamePoints
                    ? `Games ${visibleScoreboard.result}`
                    : visibleScoreboard.result}
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2.5 md:grid-cols-2">
              <article className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <AvatarImage
                    src={visibleScoreboard.player_one_avatar_url}
                    alt={visibleScoreboard.player_one_name}
                    size={42}
                    className="h-[42px] w-[42px] rounded-full border border-slate-200 object-cover shadow-sm"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                      Jugador 1
                    </p>
                    <h3 className="mt-1 text-xl font-bold leading-tight text-slate-950">
                      {visibleScoreboard.player_one_name}
                    </h3>
                    {visibleScoreboard.winner_side === 1 ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Ganador
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>

              <article className="rounded-2xl bg-white px-3 py-3 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <AvatarImage
                    src={visibleScoreboard.player_two_avatar_url}
                    alt={visibleScoreboard.player_two_name}
                    size={42}
                    className="h-[42px] w-[42px] rounded-full border border-slate-200 object-cover shadow-sm"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                      Jugador 2
                    </p>
                    <h3 className="mt-1 text-xl font-bold leading-tight text-slate-950">
                      {visibleScoreboard.player_two_name}
                    </h3>
                    {visibleScoreboard.winner_side === 2 ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Ganador
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            </div>

            <div className="mt-3 grid gap-2.5 md:grid-cols-2">
              {hasVisibleCurrentGamePoints ? (
                <div className="rounded-2xl border border-orange-200 bg-white px-3 py-3 md:col-span-2">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    Punto actual
                  </p>
                  <p className="mt-1 text-[1.75rem] font-bold leading-none text-slate-950">
                    {visibleScoreboard.current_game_points_player_one} -{" "}
                    {visibleScoreboard.current_game_points_player_two}
                  </p>
                </div>
              ) : null}

              {parsedGames.length ? (
                <div className="rounded-2xl border border-orange-200 bg-white px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    Games
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {parsedGames.map((game) => (
                      <div
                        key={game.key}
                        className="grid grid-cols-[auto_auto_1fr] items-center gap-2"
                      >
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {game.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-900">
                          {game.score}
                        </span>
                        <span
                          className={`justify-self-end rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            game.winnerSide === 1
                              ? "bg-slate-900 text-white"
                              : game.winnerSide === 2
                                ? "bg-orange-100 text-orange-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {game.winnerLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {(visibleScoreboard.event_name ||
                visibleScoreboard.round_name ||
                visibleScoreboard.location) ? (
                <div className="rounded-2xl border border-orange-200 bg-white px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                    Partido
                  </p>
                  {visibleScoreboard.event_name ? (
                    <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">
                      {visibleScoreboard.event_name}
                    </p>
                  ) : null}
                  {visibleScoreboard.round_name ? (
                    <p className="mt-1 text-xs text-slate-600">
                      {visibleScoreboard.round_name}
                    </p>
                  ) : null}
                  {visibleScoreboard.location ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {visibleScoreboard.location}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : (
          <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
            El marcador de Squore va a aparecer aca apenas la tablet de{" "}
            {court.label.toLowerCase()} empiece a postear.
          </div>
        )}

        <LiveCommentsSection
          court={court}
          authenticatedUserId={authenticatedUserId}
          onRefresh={onRefresh}
        />
      </article>

      {isFocusMode ? (
        <div className="fixed inset-0 z-[80] bg-slate-950">
          <div className="relative h-full overflow-hidden bg-black">
            <iframe
              className="h-full w-full"
              src={stream.embed_url}
              title={`${court.label} - ${stream.title} ampliado`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />

            {visibleScoreboard ? (
              <LiveScoreOverlay
                scoreboard={visibleScoreboard}
                expanded
              />
            ) : null}

            <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4">
              <div className="mx-auto flex max-w-5xl justify-end">
                <button
                  type="button"
                  onClick={handleExitExpandedMode}
                  className="pointer-events-auto rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-slate-950/85"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function LivePage() {
  const [courts, setCourts] = useState<LiveCourtState[]>([]);
  const [loading, setLoading] = useState(true);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(
    null
  );
  const courtsRef = useRef<LiveCourtState[]>([]);
  const realtimeScoreboardsRef = useRef<
    Partial<Record<LiveCourtState["id"], LiveScoreboard>>
  >({});

  useEffect(() => {
    courtsRef.current = courts;
  }, [courts]);

  const loadStream = useCallback(async () => {
    const current = await fetchLiveCenterStatus();
    const hydratedCourts = await hydrateCourtsWithSquoreFeed(current.courts);
    setCourts(
      hydratedCourts.map((court) => ({
        ...court,
        scoreboard: mergeRealtimeScoreboard(
          court.scoreboard,
          realtimeScoreboardsRef.current[court.id]
        )
      }))
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingInFlight = false;

    const syncAuthState = () => {
      setAuthenticatedUserId(getSession()?.user?.id || null);
    };

    async function runLoad() {
      if (loadingInFlight) {
        return;
      }

      loadingInFlight = true;

      try {
        const current = await fetchLiveCenterStatus();
        const hydratedCourts = await hydrateCourtsWithSquoreFeed(current.courts);
        if (!cancelled) {
          setCourts(
            hydratedCourts.map((court) => ({
              ...court,
              scoreboard: mergeRealtimeScoreboard(
                court.scoreboard,
                realtimeScoreboardsRef.current[court.id]
              )
            }))
          );
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

    syncAuthState();
    void runLoad();

    const intervalId = window.setInterval(() => {
      void runLoad();
    }, LIVE_REFRESH_MS);

    const handleFocus = () => {
      syncAuthState();
      void runLoad();
    };

    const handleAuthChange = () => {
      syncAuthState();
      void runLoad();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("sr-auth-change", handleAuthChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("sr-auth-change", handleAuthChange);
    };
  }, []);

  const configuredCourts = useMemo(
    () => courts.filter((court) => court.stream),
    [courts]
  );

  const mqttConfigSignature = useMemo(
    () =>
      configuredCourts
        .map((court) =>
          [
            court.id,
            court.stream?.squore_mqtt_broker_url || "",
            court.stream?.squore_mqtt_match_topic || "",
            court.stream?.squore_mqtt_change_topic || ""
          ].join("|")
        )
        .join("||"),
    [configuredCourts]
  );

  useEffect(() => {
    let disposed = false;
    let stop: () => void = () => {};
    const subscriptionCourts = courtsRef.current
      .filter((court) => court.stream)
      .map((court) => ({
        id: court.id,
        label: court.label,
        stream: court.stream,
        scoreboard: null,
        comments: []
      }));

    async function connectRealtime() {
      const nextStop = await startSquoreMqttLiveSync(
        subscriptionCourts,
        (courtId, scoreboard) => {
          realtimeScoreboardsRef.current[courtId] = scoreboard;

          if (disposed) {
            return;
          }

          setCourts((currentCourts) =>
            currentCourts.map((court) =>
              court.id === courtId
                ? {
                    ...court,
                    scoreboard
                  }
                : court
            )
          );
        }
      );

      if (disposed) {
        nextStop();
        return;
      }

      stop = nextStop;
    }

    void connectRealtime();

    return () => {
      disposed = true;
      stop();
    };
  }, [mqttConfigSignature]);

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
                <LiveCourtBroadcastCard
                  key={court.id}
                  court={court}
                  authenticatedUserId={authenticatedUserId}
                  onRefresh={loadStream}
                />
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
