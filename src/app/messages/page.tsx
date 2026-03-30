"use client";

import { useEffect, useMemo, useState } from "react";
import { AvatarImage } from "@/components/AvatarImage";
import { AppNoticeModal } from "@/components/AppNoticeModal";
import { SectionTitle } from "@/components/SectionTitle";
import {
  createPrivateMessageGroup,
  fetchPlayers,
  fetchPrivateGroupMessages,
  fetchPrivateMessageGroups,
  fetchPrivateMessages,
  getSession,
  getUser,
  markConversationAsRead,
  markPrivateGroupAsRead,
  sendPrivateGroupMessage,
  sendPrivateMessage,
  updatePrivateMessageGroup
} from "@/lib/supabase";
import {
  PrivateGroupMessage,
  PrivateMessage,
  PrivateMessageGroup,
  Profile
} from "@/types/db";

type Tab = "direct" | "group";
type GroupEditorMode = "create" | "edit";

function formatMessageTimestamp(dateValue?: string | null) {
  if (!dateValue) return "";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("direct");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [directMessages, setDirectMessages] = useState<PrivateMessage[]>([]);
  const [groups, setGroups] = useState<PrivateMessageGroup[]>([]);
  const [groupMessages, setGroupMessages] = useState<PrivateGroupMessage[]>([]);
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [initialRecipientId, setInitialRecipientId] = useState<string | null>(null);
  const [directDraft, setDirectDraft] = useState("");
  const [groupDraft, setGroupDraft] = useState("");
  const [groupFormName, setGroupFormName] = useState("");
  const [groupFormMemberIds, setGroupFormMemberIds] = useState<string[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [groupsUnavailable, setGroupsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [updatingGroup, setUpdatingGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setInitialRecipientId(params.get("to"));
  }, []);

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

    const [allPlayers, messages, groupData] = await Promise.all([
      fetchPlayers(token),
      fetchPrivateMessages(user.id, token),
      fetchPrivateMessageGroups(token).catch(() => ({
        groups: [],
        unavailable: true
      }))
    ]);

    const availablePlayers = (allPlayers ?? []).filter((player) => player.id !== user.id);
    setPlayers(availablePlayers);
    setDirectMessages(messages ?? []);
    setGroups(groupData.groups ?? []);
    setGroupsUnavailable(groupData.unavailable === true);

    const suggestedPlayer =
      (preferredRecipientId &&
      availablePlayers.some((player) => player.id === preferredRecipientId)
        ? preferredRecipientId
        : null) ||
      (messages ?? [])
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

    setSelectedPlayerId(suggestedPlayer);
    setSelectedGroupId((current) =>
      current && (groupData.groups ?? []).some((group) => group.id === current)
        ? current
        : groupData.groups?.[0]?.id || ""
    );
    setError(null);
    setLoading(false);
  }

  async function loadGroupConversation(groupId: string) {
    const token = getSession()?.access_token;
    if (!token || !groupId) {
      setGroupMessages([]);
      setGroupMembers([]);
      return;
    }

    setGroupLoading(true);
    try {
      const payload = await fetchPrivateGroupMessages(groupId, token);
      setGroupMessages(payload.messages ?? []);
      setGroupMembers(payload.members ?? []);
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "No se pudo cargar el grupo");
    } finally {
      setGroupLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void loadData(initialRecipientId).catch((err) => {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los mensajes");
      setLoading(false);
    });
  }, [initialRecipientId]);

  useEffect(() => {
    if (tab === "group" && selectedGroupId) {
      void loadGroupConversation(selectedGroupId);
    }
  }, [tab, selectedGroupId]);

  const selectedPlayer = useMemo(
    () => players.find((player) => player.id === selectedPlayerId) ?? null,
    [players, selectedPlayerId]
  );

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const visibleGroupMembers = groupMembers.length
    ? groupMembers
    : selectedGroup?.members || [];

  const selectedGroupIsGeneral = Boolean(selectedGroup?.is_general);
  const canEditSelectedGroup =
    Boolean(selectedGroup) &&
    !selectedGroupIsGeneral &&
    selectedGroup?.created_by === currentUserId;

  const directUnreadCount = useMemo(() => {
    if (!currentUserId) return 0;
    return directMessages.filter(
      (message) => message.recipient_id === currentUserId && !message.read_at
    ).length;
  }, [currentUserId, directMessages]);

  const groupUnreadCount = useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + (group.unread_count || 0),
        0
      ),
    [groups]
  );

  const currentDirectMessages = useMemo(() => {
    if (!currentUserId || !selectedPlayerId) return [];

    return directMessages.filter((message) => {
      const sent =
        message.sender_id === currentUserId && message.recipient_id === selectedPlayerId;
      const received =
        message.sender_id === selectedPlayerId && message.recipient_id === currentUserId;
      return sent || received;
    });
  }, [currentUserId, directMessages, selectedPlayerId]);

  const directSummaries = useMemo(() => {
    if (!currentUserId) return new Map<string, { preview: string; created_at?: string }>();

    const summaries = new Map<string, { preview: string; created_at?: string }>();

    for (const message of directMessages) {
      const playerId =
        message.sender_id === currentUserId ? message.recipient_id : message.sender_id;

      summaries.set(playerId, {
        preview: message.body,
        created_at: message.created_at
      });
    }

    return summaries;
  }, [currentUserId, directMessages]);

  useEffect(() => {
    async function syncRead() {
      const token = getSession()?.access_token;
      if (!token || !currentUserId || !selectedPlayerId || tab !== "direct") return;

      const hasUnread = directMessages.some(
        (message) =>
          message.sender_id === selectedPlayerId &&
          message.recipient_id === currentUserId &&
          !message.read_at
      );

      if (!hasUnread) return;

      try {
        await markConversationAsRead(selectedPlayerId, currentUserId, token);
        setDirectMessages((current) =>
          current.map((message) =>
            message.sender_id === selectedPlayerId &&
            message.recipient_id === currentUserId &&
            !message.read_at
              ? { ...message, read_at: new Date().toISOString() }
              : message
          )
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("sr-messages-updated"));
        }
      } catch {
        // Ignore background read sync errors.
      }
    }

    void syncRead();
  }, [tab, currentUserId, selectedPlayerId, directMessages]);

  useEffect(() => {
    async function syncGroupRead() {
      const token = getSession()?.access_token;
      if (!token || tab !== "group" || !selectedGroupId) return;

      const group = groups.find((item) => item.id === selectedGroupId);
      if (!group?.unread_count) return;

      try {
        await markPrivateGroupAsRead(selectedGroupId, token);
        setGroups((current) =>
          current.map((item) =>
            item.id === selectedGroupId ? { ...item, unread_count: 0 } : item
          )
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("sr-messages-updated"));
        }
      } catch {
        // Ignore background read sync errors.
      }
    }

    void syncGroupRead();
  }, [tab, selectedGroupId, groups]);

  function toggleGroupFormMember(playerId: string) {
    setGroupFormMemberIds((current) =>
      current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId]
    );
  }

  function openCreateGroup() {
    setShowEditGroup(false);
    setGroupFormName("");
    setGroupFormMemberIds([]);
    setShowCreateGroup((current) => !current);
  }

  function openEditGroup() {
    if (!selectedGroup) return;
    setShowCreateGroup(false);
    setGroupFormName(selectedGroup.name || "");
    setGroupFormMemberIds(
      (selectedGroup.members || [])
        .map((member) => member.id)
        .filter((memberId) => memberId !== currentUserId)
    );
    setShowEditGroup(true);
  }

  async function handleSendDirect() {
    try {
      const token = getSession()?.access_token;
      if (!token || !currentUserId) throw new Error("Debes iniciar sesión");
      if (!selectedPlayerId) throw new Error("Debes elegir un jugador");
      if (!directDraft.trim()) throw new Error("Escribe un mensaje antes de enviarlo");

      setSending(true);
      await sendPrivateMessage(currentUserId, selectedPlayerId, directDraft, token);
      setDirectDraft("");
      await loadData(selectedPlayerId);
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  }

  async function handleSendGroup() {
    try {
      const token = getSession()?.access_token;
      if (!token) throw new Error("Debes iniciar sesión");
      if (!selectedGroupId) throw new Error("Debes elegir un grupo");
      if (!groupDraft.trim()) throw new Error("Escribe un mensaje antes de enviarlo");

      setSending(true);
      await sendPrivateGroupMessage(selectedGroupId, groupDraft, token);
      setGroupDraft("");
      await Promise.all([loadData(initialRecipientId), loadGroupConversation(selectedGroupId)]);
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "No se pudo enviar al grupo");
    } finally {
      setSending(false);
    }
  }

  async function handleCreateGroup() {
    try {
      const token = getSession()?.access_token;
      if (!token) throw new Error("Debes iniciar sesión");
      if (!groupFormName.trim()) throw new Error("El grupo necesita un nombre.");
      if (!groupFormMemberIds.length) {
        throw new Error("Debes seleccionar al menos un integrante.");
      }

      setCreatingGroup(true);
      const createdGroup = await createPrivateMessageGroup(
        groupFormName,
        groupFormMemberIds,
        token
      );
      setGroupFormName("");
      setGroupFormMemberIds([]);
      setShowCreateGroup(false);
      setTab("group");
      await loadData(initialRecipientId);
      if (createdGroup?.id) {
        setSelectedGroupId(createdGroup.id);
        await loadGroupConversation(createdGroup.id);
      }
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "No se pudo crear el grupo");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleUpdateGroup() {
    try {
      const token = getSession()?.access_token;
      if (!token) throw new Error("Debes iniciar sesión");
      if (!selectedGroupId) throw new Error("Debes elegir un grupo");
      if (!groupFormName.trim()) throw new Error("El grupo necesita un nombre.");
      if (!groupFormMemberIds.length) {
        throw new Error("Debes dejar al menos un integrante.");
      }

      setUpdatingGroup(true);
      await updatePrivateMessageGroup(
        selectedGroupId,
        {
          name: groupFormName,
          memberIds: groupFormMemberIds
        },
        token
      );
      setShowEditGroup(false);
      await Promise.all([loadData(initialRecipientId), loadGroupConversation(selectedGroupId)]);
    } catch (err) {
      setNoticeMessage(err instanceof Error ? err.message : "No se pudo actualizar el grupo");
    } finally {
      setUpdatingGroup(false);
    }
  }

  function renderGroupEditor(mode: GroupEditorMode) {
    const isCreate = mode === "create";
    const busy = isCreate ? creatingGroup : updatingGroup;

    return (
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nombre del grupo
          </label>
          <input
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            value={groupFormName}
            onChange={(e) => setGroupFormName(e.target.value)}
            placeholder="Ej: Miércoles 21 hs"
          />
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {players.map((player) => (
            <label
              key={player.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
            >
              <input
                type="checkbox"
                checked={groupFormMemberIds.includes(player.id)}
                onChange={() => toggleGroupFormMember(player.id)}
              />
              <AvatarImage
                src={player.avatar_url}
                alt={player.full_name || "Jugador"}
                size={36}
                className="h-9 w-9 rounded-full object-cover"
              />
              <div>
                <p className="font-medium text-slate-900">
                  {player.full_name || "Sin nombre"}
                </p>
                <p className="text-sm text-slate-500">
                  {player.category || "Sin categoría"}
                </p>
              </div>
            </label>
          ))}
        </div>
        {isCreate ? null : (
          <p className="text-xs text-slate-500">
            Solo quien creó el grupo puede renombrarlo o cambiar integrantes.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              isCreate ? setShowCreateGroup(false) : setShowEditGroup(false)
            }
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={isCreate ? handleCreateGroup : handleUpdateGroup}
            disabled={busy}
          >
            {busy
              ? isCreate
                ? "Creando..."
                : "Guardando..."
              : isCreate
                ? "Crear grupo"
                : "Guardar cambios"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <SectionTitle
          title="Mensajes"
          subtitle="Contactate por privado con otros jugadores o armá grupos cerrados."
        />

        {loading ? <p>Cargando mensajes...</p> : null}
        {error ? <p className="text-red-600">{error}</p> : null}

        {!loading && !error ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={tab === "direct" ? "btn-primary" : "btn-secondary"}
                onClick={() => setTab("direct")}
              >
                Mensajes directos
                {directUnreadCount > 0 ? (
                  <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {directUnreadCount > 9 ? "9+" : directUnreadCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={tab === "group" ? "btn-primary" : "btn-secondary"}
                onClick={() => setTab("group")}
              >
                Grupos privados
                {groupUnreadCount > 0 ? (
                  <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {groupUnreadCount > 9 ? "9+" : groupUnreadCount}
                  </span>
                ) : null}
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
              <section className="card space-y-4 p-4">
                {tab === "direct" ? (
                  <>
                    <label className="block text-sm font-medium text-slate-700">
                      Jugador
                    </label>
                    <select
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                      value={selectedPlayerId}
                      onChange={(e) => setSelectedPlayerId(e.target.value)}
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

                    <div className="space-y-2">
                      {players.slice(0, 12).map((player) => {
                        const unread = directMessages.filter(
                          (message) =>
                            message.sender_id === player.id &&
                            message.recipient_id === currentUserId &&
                            !message.read_at
                        ).length;
                        const active = player.id === selectedPlayerId;
                        const summary = directSummaries.get(player.id);

                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => setSelectedPlayerId(player.id)}
                            className={`animate-pop-in flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                              active
                                ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                                : "border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:bg-slate-50"
                            }`}
                          >
                            <AvatarImage
                              src={player.avatar_url}
                              alt={player.full_name || "Jugador"}
                              size={44}
                              className={`h-11 w-11 rounded-full border object-cover ${
                                active ? "border-slate-700" : "border-slate-200"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                {player.full_name || "Sin nombre"}
                              </p>
                              <p
                                className={`truncate text-sm ${
                                  active ? "text-slate-200" : "text-slate-500"
                                }`}
                              >
                                {player.category || "Sin categoría"}
                              </p>
                              <p
                                className={`mt-1 truncate text-xs ${
                                  active ? "text-slate-300" : "text-slate-400"
                                }`}
                              >
                                {summary?.preview || "Todavía no hablaron."}
                              </p>
                            </div>
                            {summary?.created_at ? (
                              <span
                                className={`shrink-0 text-[11px] ${
                                  active ? "text-slate-300" : "text-slate-400"
                                }`}
                              >
                                {formatMessageTimestamp(summary.created_at)}
                              </span>
                            ) : null}
                            {unread > 0 ? (
                              <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                {unread}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Tus grupos</p>
                        <p className="text-sm text-slate-500">
                          Usá el grupo general del club o armá grupos cerrados entre jugadores.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {canEditSelectedGroup ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={openEditGroup}
                            disabled={groupsUnavailable}
                          >
                            Editar grupo
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={openCreateGroup}
                          disabled={groupsUnavailable}
                        >
                          Nuevo grupo
                        </button>
                      </div>
                    </div>

                    {groupsUnavailable ? (
                      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                        Los grupos privados todavía no están habilitados en la base.
                        Falta correr la migración SQL.
                      </div>
                    ) : null}

                    {showCreateGroup && !groupsUnavailable
                      ? renderGroupEditor("create")
                      : null}
                    {showEditGroup && !groupsUnavailable && selectedGroup
                      ? renderGroupEditor("edit")
                      : null}

                    <div className="space-y-2">
                      {groups.length ? (
                        groups.map((group) => {
                          const currentGroup = group as PrivateMessageGroup & {
                            last_message_body?: string | null;
                            last_message_at?: string | null;
                          };
                          const active = group.id === selectedGroupId;
                          const names = (group.members || [])
                            .map((member) => member.full_name || "Sin nombre")
                            .slice(0, 2)
                            .join(", ");
                          const groupSummary = group.is_general
                            ? `${group.members?.length || 0} jugadores registrados`
                            : names || "Sin integrantes visibles";

                          return (
                            <button
                              key={group.id}
                              type="button"
                              onClick={() => setSelectedGroupId(group.id)}
                              className={`animate-pop-in flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                                active
                                  ? "border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                                  : "border-slate-200 bg-white text-slate-900 hover:-translate-y-0.5 hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="flex -space-x-3">
                                  {(group.members || []).slice(0, 3).map((member) => (
                                    <AvatarImage
                                      key={member.id}
                                      src={member.avatar_url}
                                      alt={member.full_name || "Jugador"}
                                      size={40}
                                      className={`h-10 w-10 rounded-full border-2 object-cover ${
                                        active ? "border-slate-900" : "border-white"
                                      }`}
                                    />
                                  ))}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate font-medium">
                                      {group.is_general ? "Grupo general" : group.name}
                                    </p>
                                    {group.is_general ? (
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                          active
                                            ? "bg-orange-400 text-slate-950"
                                            : "bg-orange-100 text-orange-700"
                                        }`}
                                      >
                                        General
                                      </span>
                                    ) : null}
                                  </div>
                                  {group.is_general ? (
                                    <p
                                      className={`mt-1 truncate text-xs font-medium ${
                                        active ? "text-orange-300" : "text-orange-600"
                                      }`}
                                    >
                                      Canal general del club
                                    </p>
                                  ) : null}
                                  <p
                                    className={`truncate text-sm ${
                                      active ? "text-slate-200" : "text-slate-500"
                                    }`}
                                  >
                                    {groupSummary}
                                  </p>
                                  <p
                                    className={`mt-1 truncate text-xs ${
                                      active ? "text-slate-300" : "text-slate-400"
                                    }`}
                                  >
                                    {currentGroup.last_message_body || "Todavía no hay mensajes."}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {currentGroup.last_message_at ? (
                                  <span
                                    className={`text-[11px] ${
                                      active ? "text-slate-300" : "text-slate-400"
                                    }`}
                                  >
                                    {formatMessageTimestamp(currentGroup.last_message_at)}
                                  </span>
                                ) : null}
                                <p
                                  className="sr-only"
                                >
                                  {group.name}
                                </p>
                              </div>
                              {group.unread_count ? (
                                <span className="rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                  {group.unread_count}
                                </span>
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                          Todavía no tenés grupos creados.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
              <section className="card flex min-h-[520px] flex-col p-4">
                {tab === "direct" ? (
                  <>
                    <div className="border-b border-slate-200 pb-4">
                      <div className="flex items-center gap-3">
                        <AvatarImage
                          src={selectedPlayer?.avatar_url}
                          alt={selectedPlayer?.full_name || "Jugador"}
                          size={56}
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
                      {currentDirectMessages.length ? (
                        currentDirectMessages.map((message) => {
                          const own = message.sender_id === currentUserId;
                          return (
                            <div
                              key={message.id}
                              className={`animate-pop-in flex ${own ? "justify-end" : "justify-start"}`}
                            >
                              <div className={`flex max-w-[88%] items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
                                {!own ? (
                                  <AvatarImage
                                    src={selectedPlayer?.avatar_url}
                                    alt={selectedPlayer?.full_name || "Jugador"}
                                    size={36}
                                    className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                                  />
                                ) : null}
                                <div
                                  className={`rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                                    own
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-100 text-slate-900"
                                  }`}
                                >
                                  <p>{message.body}</p>
                                  <p
                                    className={`mt-2 text-xs ${
                                      own ? "text-slate-300" : "text-slate-500"
                                    }`}
                                  >
                                    {formatMessageTimestamp(message.created_at)}
                                  </p>
                                </div>
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
                        value={directDraft}
                        onChange={(e) => setDirectDraft(e.target.value)}
                        placeholder="Escribí tu mensaje privado..."
                        disabled={!selectedPlayerId || sending}
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleSendDirect}
                          disabled={!selectedPlayerId || sending}
                        >
                          {sending ? "Enviando..." : "Enviar mensaje"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="border-b border-slate-200 pb-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          {selectedGroupIsGeneral ? (
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                              Canal general del club
                            </p>
                          ) : null}
                          <p className="text-lg font-semibold text-slate-900">
                            {selectedGroup?.name || "Elegí un grupo"}
                          </p>
                          <p className="text-sm text-slate-500">
                            {selectedGroupIsGeneral
                              ? `${visibleGroupMembers.length} jugadores registrados`
                              : `${visibleGroupMembers.length} integrantes`}
                          </p>
                        </div>
                        {canEditSelectedGroup ? (
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={openEditGroup}
                          >
                            Editar
                          </button>
                        ) : null}
                      </div>
                      {selectedGroupIsGeneral ? (
                        <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm text-slate-700">
                          Este grupo incluye automáticamente a todos los jugadores registrados del club.
                        </div>
                      ) : visibleGroupMembers.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {visibleGroupMembers.map((member) => (
                            <span
                              key={member.id}
                              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                            >
                              {member.full_name || "Sin nombre"}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto py-4">
                      {groupLoading ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                          Cargando grupo...
                        </div>
                      ) : groupMessages.length ? (
                        groupMessages.map((message) => {
                          const own = message.sender_id === currentUserId;
                          return (
                            <div
                              key={message.id}
                              className={`animate-pop-in flex ${own ? "justify-end" : "justify-start"}`}
                            >
                              <div className={`flex max-w-[88%] items-end gap-2 ${own ? "flex-row-reverse" : ""}`}>
                                {!own ? (
                                  <AvatarImage
                                    src={message.profiles?.avatar_url}
                                    alt={message.profiles?.full_name || "Jugador"}
                                    size={36}
                                    className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                                  />
                                ) : null}
                                <div
                                  className={`rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${
                                    own
                                      ? "bg-slate-900 text-white"
                                      : "bg-slate-100 text-slate-900"
                                  }`}
                                >
                                  {!own ? (
                                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      {message.profiles?.full_name || "Jugador"}
                                    </p>
                                  ) : null}
                                  <p>{message.body}</p>
                                  <p
                                    className={`mt-2 text-xs ${
                                      own ? "text-slate-300" : "text-slate-500"
                                    }`}
                                  >
                                    {formatMessageTimestamp(message.created_at)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                          No hay mensajes todavía en este grupo.
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <textarea
                        className="min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                        value={groupDraft}
                        onChange={(e) => setGroupDraft(e.target.value)}
                        placeholder="Escribí tu mensaje para el grupo..."
                        disabled={!selectedGroupId || sending || groupsUnavailable}
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleSendGroup}
                          disabled={!selectedGroupId || sending || groupsUnavailable}
                        >
                          {sending ? "Enviando..." : "Enviar al grupo"}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
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
