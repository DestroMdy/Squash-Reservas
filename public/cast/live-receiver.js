(function () {
  const NAMESPACE = "urn:x-cast:com.lamartineta.squash.live";
  const POLL_MS = 3000;
  const DEFAULT_COURT_ID = "court-1";
  const root = document.getElementById("receiver-video");
  const params = new URLSearchParams(window.location.search);
  let currentCourtId = params.get("courtId") || DEFAULT_COURT_ID;
  let currentStreamKey = "";

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCompactPlayerName(value) {
    const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return value || "";
    }

    const preferred = parts[0] || value || "";
    return preferred.length > 14 ? preferred.slice(0, 14) + "…" : preferred;
  }

  function normalizeParticipantName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function parseGames(gameScores, playerOneName, playerTwoName) {
    if (!gameScores) {
      return [];
    }

    return String(gameScores)
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
          label: "G" + (index + 1),
          score: playerOneScore + "-" + playerTwoScore,
          winnerSide: winnerSide,
          winnerLabel:
            winnerSide === 1
              ? getCompactPlayerName(playerOneName)
              : winnerSide === 2
                ? getCompactPlayerName(playerTwoName)
                : "Igualado"
        };
      })
      .filter(Boolean);
  }

  function resolveWinnerSide(scoreboard, games) {
    if (!scoreboard) {
      return null;
    }

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
      const lastCompletedGame = games[games.length - 1];
      if (lastCompletedGame && (lastCompletedGame.winnerSide === 1 || lastCompletedGame.winnerSide === 2)) {
        return lastCompletedGame.winnerSide;
      }
    }

    return null;
  }

  function buildAvatar(playerName, avatarUrl) {
    if (avatarUrl) {
      return '<img src="' + escapeHtml(avatarUrl) + '" alt="' + escapeHtml(playerName) + '" />';
    }

    const initial = escapeHtml((playerName || "?").trim().charAt(0) || "?");
    return '<span class="receiver-avatar-fallback">' + initial + "</span>";
  }

  function buildPlayerColumn(playerName, avatarUrl, isWinner, alignRight) {
    return (
      '<div class="receiver-player' + (alignRight ? " receiver-player--right" : "") + '">' +
      buildAvatar(playerName, avatarUrl) +
      '<div class="receiver-player-copy">' +
      '<p class="receiver-player-name">' + escapeHtml(playerName) + "</p>" +
      (isWinner
        ? '<p class="receiver-player-win">Ganador</p>'
        : "") +
      "</div>" +
      "</div>"
    );
  }

  function appendAutoplay(embedUrl) {
    if (!embedUrl) {
      return "";
    }

    try {
      const url = new URL(embedUrl);
      url.searchParams.set("autoplay", "1");
      url.searchParams.set("playsinline", "1");
      return url.toString();
    } catch {
      return embedUrl;
    }
  }

  function renderWaitingState() {
    root.innerHTML =
      '<div class="receiver-empty">' +
      '<span class="receiver-kicker">Google Cast</span>' +
      "<h1>Esperando una cancha para transmitir</h1>" +
      "<p>Cuando envies Cancha 1 o Cancha 2 desde la app, la TV va a mostrar el video y el marcador automaticamente.</p>" +
      "</div>";
  }

  function renderCourt(court) {
    if (!court || !court.stream) {
      renderWaitingState();
      return;
    }

    const scoreboard = court.scoreboard;
    const games = scoreboard
      ? parseGames(
          scoreboard.game_scores,
          scoreboard.player_one_name,
          scoreboard.player_two_name
        )
      : [];
    const effectiveWinnerSide = scoreboard
      ? resolveWinnerSide(scoreboard, games)
      : null;
    const hasCurrentGamePoints =
      scoreboard &&
      scoreboard.current_game_points_player_one !== null &&
      scoreboard.current_game_points_player_one !== undefined &&
      scoreboard.current_game_points_player_two !== null &&
      scoreboard.current_game_points_player_two !== undefined &&
      !effectiveWinnerSide;
    const currentScore =
      scoreboard &&
      hasCurrentGamePoints
        ? scoreboard.current_game_points_player_one +
          " - " +
          scoreboard.current_game_points_player_two
        : scoreboard && scoreboard.game_scores
          ? scoreboard.game_scores
          : "-";
    const currentLabel =
      scoreboard && hasCurrentGamePoints
        ? "Punto actual"
        : effectiveWinnerSide
          ? "Gano " +
            (effectiveWinnerSide === 1
              ? getCompactPlayerName(scoreboard.player_one_name)
              : getCompactPlayerName(scoreboard.player_two_name))
          : "Games";

    root.innerHTML =
      '<div class="receiver-topbar">' +
      '<span class="receiver-court">' + escapeHtml(court.label) + "</span>" +
      '<div class="receiver-title-wrap">' +
      '<h1 class="receiver-title">' + escapeHtml(court.stream.title) + "</h1>" +
      '<p class="receiver-subtitle">' +
      escapeHtml(
        scoreboard?.event_name ||
          scoreboard?.round_name ||
          "La Martineta Squash"
      ) +
      "</p>" +
      "</div>" +
      "</div>" +
      '<iframe src="' +
      escapeHtml(appendAutoplay(court.stream.embed_url)) +
      '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
      (scoreboard
        ? '<div class="receiver-overlay">' +
          '<div class="receiver-scoreboard">' +
          '<div class="receiver-score-top">' +
          '<span class="receiver-live-chip">Marcador en vivo</span>' +
          (scoreboard.result
            ? '<span class="receiver-result-chip">Games ' +
              escapeHtml(scoreboard.result) +
              "</span>"
            : "") +
          "</div>" +
          '<div class="receiver-score-main">' +
          buildPlayerColumn(
            scoreboard.player_one_name,
            scoreboard.player_one_avatar_url,
            effectiveWinnerSide === 1,
            false
          ) +
          '<div class="receiver-center">' +
          '<div class="receiver-center-label">' + escapeHtml(currentLabel) + "</div>" +
          '<div class="receiver-center-score">' + escapeHtml(currentScore) + "</div>" +
          "</div>" +
          buildPlayerColumn(
            scoreboard.player_two_name,
            scoreboard.player_two_avatar_url,
            effectiveWinnerSide === 2,
            true
          ) +
          "</div>" +
          (games.length
            ? '<div class="receiver-games">' +
              games
                .map(function (game) {
                  return (
                    '<div class="receiver-game">' +
                    '<span class="receiver-game-label">' + escapeHtml(game.label) + "</span>" +
                    '<span class="receiver-game-score">' + escapeHtml(game.score) + "</span>" +
                    '<span class="receiver-game-winner">' +
                    escapeHtml(game.winnerLabel) +
                    "</span>" +
                    "</div>"
                  );
                })
                .join("") +
              "</div>"
            : "") +
          "</div>" +
          "</div>"
        : "");
  }

  async function refresh() {
    try {
      const response = await fetch("/api/live-stream", { cache: "no-store" });
      const payload = await response.json();
      const court =
        Array.isArray(payload?.courts)
          ? payload.courts.find((value) => value.id === currentCourtId)
          : null;
      const streamKey = court?.stream?.updated_at || "";

      if (!court) {
        renderWaitingState();
        return;
      }

      if (streamKey !== currentStreamKey || court.scoreboard) {
        currentStreamKey = streamKey;
        renderCourt(court);
      }
    } catch {
      renderWaitingState();
    }
  }

  function setupReceiver() {
    const context = cast.framework.CastReceiverContext.getInstance();

    context.addCustomMessageListener(NAMESPACE, function (event) {
      if (event?.data?.type !== "load_court" || !event.data.courtId) {
        return;
      }

      currentCourtId = String(event.data.courtId);
      currentStreamKey = "";
      void refresh();
    });

    context.start();
  }

  renderWaitingState();
  window.setInterval(refresh, POLL_MS);
  void refresh();

  if (window.cast && window.cast.framework) {
    setupReceiver();
  } else {
    window.addEventListener("load", function () {
      if (window.cast && window.cast.framework) {
        setupReceiver();
      }
    });
  }
})();
