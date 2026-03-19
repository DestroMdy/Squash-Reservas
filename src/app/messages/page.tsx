"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNoticeModal } from "@/components/AppNoticeModal";
import { SectionTitle } from "@/components/SectionTitle";
import {
  fetchPlayers,
  fetchPrivateMessages,
  getSession,
  getUser,
  sendPrivateMessage
} from "@/lib/supabase";
import { PrivateMessage, Profile } from "@/types/db";

export default function MessagesPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("");
  const [initialRecipientId, setInitialRecipientId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState("");

  async function loadData(preferredRecipientId?: string | null) {
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

    setCurrentUserId(user.id);

    const [allPlayers, privateMessages] = await Promise.all([
      fetchPlayers(token),
      fetchPrivateMessages(user.id, token)
    ]);

    const availablePlayers = (allPlayers ?? []).filter(
      (player) => player.id !== user.id
    );

    setPlayers(availablePlayers);
    setMessages(privateMessages ?? []);

    const candidateId =
      (preferredRecipientId &&
      availablePlayers.some((player) => player.id === preferredRecipientId)
        ? preferredRecipientId
        : null) ||
      (privateMessages ?? [])
        .slice()
        .reverse()
        .map((message) =>
          message.sender_id === user.id ? message.recipient_id : message.sender_id
        )
        .find((playerId) =>
          availablePlayers.some((player) => player.id === playerId)
        ) ||
      availablePlayers[0]?.id ||
      "";

    setSelectedPlayerId(candidateId);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setInitialRecipientId(params.get("to"));
  }, []);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        await loadData(initialRecipientId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudieron cargar los mensajes"
        );
        setLoading(false);
      }
    }

    init();
  }, [initialRecipientId]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );

  const conversationMessages = useMemo(() => {
    if (!currentUserId || !selectedPlayerId) {
      return [];
    }

    return messages.filter((message) => {
      const isSent =
        message.sender_id === currentUserId &&
        message.recipient_id === selectedPlayerId;
      const isReceived =
        message.sender_id === selectedPlayerId &&
        message.recipient_id === currentUserId;
      return isSent || isReceived;
    });
  }, [currentUserId, messages, selectedPlayerId]);

  async function handleSend() {
    try {
      const token = getSession()?.access_token;
      if (!token || !currentUserId) {
        throw new Error("Debes iniciar sesión");
      }

      if (!selectedPlayerId) {
        throw new Error("Debes elegir un jugador");
      }

      if (!draft.trim()) {
        throw new Error("Escribe un mensaje antes de enviarlo");
      }

      setSending(true);
      await sendPrivateMessage(currentUserId, selectedPlayerId, draft, token);
      setDraft("");
      await loadData(selectedPlayerId);
    } catch (err) {
      setNoticeMessage(
        err instanceof Error ? err.message : "No se pudo enviar el mensaje"
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="space-y-6">
        <SectionTitle
          title="Mensajes privados"
          subtitle="Contactate con otros jugadores sin mostrar teléfonos en público."
        />

        {loading ? <p>Cargando mensajes...</p> : null}
        {error ? <p className="text-red-600">{error}</p> : null}

        {!loading && !error ? (
          <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
            <section className="card space-y-4 p-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Jugador
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={selectedPlayerId}
                  onChange={(event) => setSelectedPlayerId(event.target.value)}
                >
                  {players.length ? (
                    players.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.full_name || "Sin nombre"} ·{" "}
                        {player.category || "Sin categoría"}
                      </option>
                    ))
                  ) : (
                    <option value="">No hay jugadores disponibles</option>
                  )}
                </select>
              </div>

              <div className="space-y-2">
                {players.slice(0, 8).map((player) => {
                  const isActive = player.id === selectedPlayerId;
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setSelectedPlayerId(player.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <img
                        src={player.avatar_url || "/icon-192.png"}
                        alt={player.full_name || "Jugador"}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {player.full_name || "Sin nombre"}
                        </p>
                        <p
                          className={`truncate text-sm ${
                            isActive ? "text-slate-200" : "text-slate-500"
                          }`}
                        >
                          {player.category || "Sin categoría"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="card flex min-h-[520px] flex-col p-4">
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedPlayer?.avatar_url || "/icon-192.png"}
                    alt={selectedPlayer?.full_name || "Jugador"}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {selectedPlayer?.full_name || "Elegí un jugador"}
                    </p>
                    <p className="text-sm text-slate-500">
                      {selectedPlayer?.category || "Sin categoría"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {conversationMessages.length ? (
                  conversationMessages.map((message) => {
                    const isOwnMessage = message.sender_id === currentUserId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${
                          isOwnMessage ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                            isOwnMessage
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-900"
                          }`}
                        >
                          <p>{message.body}</p>
                          <p
                            className={`mt-2 text-xs ${
                              isOwnMessage ? "text-slate-300" : "text-slate-500"
                            }`}
                          >
                            {new Intl.DateTimeFormat("es-AR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit"
                            }).format(new Date(message.created_at))}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No hay mensajes todavía con este jugador.
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <textarea
                  className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escribí tu mensaje privado..."
                  disabled={!selectedPlayerId || sending}
                />

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSend}
                    disabled={!selectedPlayerId || sending}
                  >
                    {sending ? "Enviando..." : "Enviar mensaje"}
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <AppNoticeModal
        open={Boolean(noticeMessage)}
        message={noticeMessage}
        onClose={() => setNoticeMessage("")}
      />
    </>
  );
}
