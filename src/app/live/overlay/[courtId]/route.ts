import { NextRequest, NextResponse } from "next/server";
import { getLiveCourtLabel, isLiveCourtId } from "@/lib/live-stream";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildOverlayHtml(origin: string, courtId: string) {
  const courtLabel = getLiveCourtLabel(courtId as "court-1" | "court-2");

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(courtLabel)} Overlay</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: Arial, sans-serif;
      }
      body {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 24px;
      }
      .overlay {
        min-width: 720px;
        max-width: 1080px;
        border-radius: 26px;
        border: 2px solid rgba(249, 115, 22, 0.85);
        background: linear-gradient(135deg, rgba(2, 6, 23, 0.96), rgba(15, 23, 42, 0.92));
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
        color: #fff;
        padding: 20px 24px;
        display: none;
      }
      .topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 16px;
      }
      .court {
        color: #fb923c;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }
      .meta {
        font-size: 14px;
        color: rgba(255,255,255,0.72);
      }
      .players {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 18px;
      }
      .player {
        padding: 18px 20px;
        border-radius: 20px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .player.right {
        text-align: right;
      }
      .label {
        font-size: 12px;
        color: rgba(255,255,255,0.58);
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .name {
        margin-top: 8px;
        font-size: 30px;
        line-height: 1.1;
        font-weight: 800;
      }
      .winner {
        margin-top: 8px;
        color: #4ade80;
        font-size: 14px;
        font-weight: 700;
      }
      .score {
        min-width: 150px;
        text-align: center;
        padding: 12px 16px;
        border-radius: 24px;
        background: #f97316;
        color: #fff;
        box-shadow: 0 18px 40px rgba(249, 115, 22, 0.35);
      }
      .score-main {
        font-size: 52px;
        line-height: 1;
        font-weight: 900;
      }
      .score-sub {
        margin-top: 6px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .bottomline {
        margin-top: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .detail {
        font-size: 16px;
        color: rgba(255,255,255,0.88);
      }
      .stale {
        color: rgba(255,255,255,0.58);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div class="overlay" id="overlay">
      <div class="topline">
        <div class="court">${escapeHtml(courtLabel)}</div>
        <div class="meta" id="meta">Esperando score...</div>
      </div>
      <div class="players">
        <div class="player">
          <div class="label">Jugador 1</div>
          <div class="name" id="playerOne">-</div>
          <div class="winner" id="winnerOne"></div>
        </div>
        <div class="score">
          <div class="score-main" id="scoreResult">-</div>
          <div class="score-sub" id="scoreGames">Sin games</div>
        </div>
        <div class="player right">
          <div class="label">Jugador 2</div>
          <div class="name" id="playerTwo">-</div>
          <div class="winner" id="winnerTwo"></div>
        </div>
      </div>
      <div class="bottomline">
        <div class="detail" id="detail">Sin partido activo</div>
        <div class="stale" id="updatedAt"></div>
      </div>
    </div>
    <script>
      const overlay = document.getElementById("overlay");
      const meta = document.getElementById("meta");
      const playerOne = document.getElementById("playerOne");
      const playerTwo = document.getElementById("playerTwo");
      const winnerOne = document.getElementById("winnerOne");
      const winnerTwo = document.getElementById("winnerTwo");
      const scoreResult = document.getElementById("scoreResult");
      const scoreGames = document.getElementById("scoreGames");
      const detail = document.getElementById("detail");
      const updatedAt = document.getElementById("updatedAt");

      function formatDate(value) {
        if (!value) return "";
        return new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date(value));
      }

      async function refreshOverlay() {
        try {
          const response = await fetch("${origin}/api/live-stream", { cache: "no-store" });
          const payload = await response.json();
          const court = (payload.courts || []).find((entry) => entry.id === "${courtId}");
          const scoreboard = court && court.scoreboard ? court.scoreboard : null;

          if (!scoreboard) {
            overlay.style.display = "none";
            return;
          }

          overlay.style.display = "block";
          meta.textContent = scoreboard.event_name || scoreboard.round_name || "Marcador en vivo";
          playerOne.textContent = scoreboard.player_one_name || "-";
          playerTwo.textContent = scoreboard.player_two_name || "-";
          winnerOne.textContent = scoreboard.winner_side === 1 ? "Ganador" : "";
          winnerTwo.textContent = scoreboard.winner_side === 2 ? "Ganador" : "";
          scoreResult.textContent = scoreboard.result || "En juego";
          scoreGames.textContent = scoreboard.game_scores || "Sin games";
          detail.textContent =
            scoreboard.round_name || scoreboard.location || scoreboard.event_name || "Partido activo";
          updatedAt.textContent = scoreboard.updated_at
            ? "Actualizado " + formatDate(scoreboard.updated_at)
            : "";
        } catch {
          overlay.style.display = "none";
        }
      }

      refreshOverlay();
      setInterval(refreshOverlay, 3000);
    </script>
  </body>
</html>`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { courtId: string } }
) {
  if (!isLiveCourtId(params.courtId)) {
    return new NextResponse("Cancha inválida", { status: 404 });
  }

  return new NextResponse(buildOverlayHtml(new URL(request.url).origin, params.courtId), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0"
    }
  });
}
