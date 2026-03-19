"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppConfirmModal } from "@/components/AppConfirmModal";
import { AppNoticeModal } from "@/components/AppNoticeModal";
import {
  cancelBooking,
  fetchProfileRole,
  getSession,
  isProfileComplete
} from "@/lib/supabase";
import {
  canBookSlot,
  canCancelBooking,
  canReserveSlot,
  isPastSlot
} from "@/lib/time-rules";
import { Booking, Court, TimeSlot } from "@/types/db";

type SlotWithRelations = TimeSlot & {
  courts?: Court;
  bookings?:
    | Pick<Booking, "id" | "status" | "user_id" | "profiles">[]
    | Pick<Booking, "id" | "status" | "user_id" | "profiles">
    | null;
};

export function ScheduleGrid({
  slots,
  selectedDate
}: {
  slots: SlotWithRelations[];
  selectedDate: string;
}) {
  const [pendingSlotId, setPendingSlotId] = useState<string | null>(null);
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [confirmingSlot, setConfirmingSlot] = useState<SlotWithRelations | null>(
    null
  );

  useEffect(() => {
    async function loadSessionData() {
      const session = getSession();
      const userId = session?.user?.id ?? null;
      const token = session?.access_token;

      setCurrentUserId(userId);

      if (userId && token) {
        const complete = await isProfileComplete(userId, token);
        const role = await fetchProfileRole(userId, token).catch(() => null);
        setProfileComplete(complete);
        setCurrentUserRole(role ?? null);
      } else {
        setProfileComplete(false);
        setCurrentUserRole(null);
      }
    }

    void loadSessionData();
  }, []);

  async function reserve(slotId: string) {
    try {
      setPendingSlotId(slotId);

      const token = getSession()?.access_token;
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify({ slotId })
      });

      const responseText = await response.text();
      const payload = responseText.trim()
        ? (JSON.parse(responseText) as { error?: string })
        : {};

      if (!response.ok) {
        throw new Error(payload.error || "No se pudo reservar");
      }

      window.location.reload();
    } catch (error) {
      setNoticeMessage(
        error instanceof Error ? error.message : "Error al reservar"
      );
    } finally {
      setPendingSlotId(null);
    }
  }

  function requestReserveConfirmation(slot: SlotWithRelations) {
    setConfirmingSlot(slot);
  }

  function formatReservationDate(slotDate: string) {
    const formatted = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    }).format(new Date(`${slotDate}T12:00:00`));

    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  async function cancel(bookingId: string) {
    try {
      setPendingCancelId(bookingId);
      const token = getSession()?.access_token;

      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      await cancelBooking(bookingId, token);
      window.location.reload();
    } catch (error) {
      setNoticeMessage(
        error instanceof Error ? error.message : "No se pudo cancelar"
      );
    } finally {
      setPendingCancelId(null);
    }
  }

  return (
    <>
      <div className="space-y-4">
        {profileComplete === false ? (
          <div className="card border-amber-200 bg-amber-50/90 p-5">
            <p className="font-semibold text-amber-900">
              Debes completar tu perfil antes de reservar.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Completa nombre, teléfono y categoría.
            </p>
            <div className="mt-4">
              <Link href="/profile" className="btn-secondary">
                Ir a mi perfil
              </Link>
            </div>
          </div>
        ) : null}

        {slots.map((slot) => {
          const bookings = Array.isArray(slot.bookings)
            ? slot.bookings
            : slot.bookings
              ? [slot.bookings]
              : [];

          const confirmedBooking = bookings.find(
            (booking) => booking.status === "confirmed"
          );
          const isReserved = Boolean(confirmedBooking);
          const isMine =
            Boolean(currentUserId) && confirmedBooking?.user_id === currentUserId;
          const isExpired = isPastSlot(slot.slot_date, slot.end_time);
          const bookingWindowOpen = canBookSlot(selectedDate);
          const canReserveThisSlot = canReserveSlot(
            slot.slot_date,
            slot.start_time,
            slot.end_time
          );
          const canCancelThisBooking =
            currentUserRole === "admin"
              ? Boolean(confirmedBooking)
              : Boolean(
                  confirmedBooking &&
                    canCancelBooking(slot.slot_date, slot.start_time)
                );

          const disabled =
            isReserved || !canReserveThisSlot || profileComplete === false;
          const isCancelling = pendingCancelId === confirmedBooking?.id;
          const playerName =
            confirmedBooking?.profiles?.full_name?.trim() || "Sin nombre";
          const playerCategory =
            confirmedBooking?.profiles?.category?.trim() || "Sin categoría";
          const playerAvatar =
            confirmedBooking?.profiles?.avatar_url || "/icon-192.png";

          const cardClass = isMine
            ? "border-blue-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(219,234,254,0.82))]"
            : isReserved
              ? "border-rose-200 bg-[linear-gradient(180deg,rgba(255,241,242,0.95),rgba(255,228,230,0.82))]"
              : isExpired
                ? "border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.95),rgba(226,232,240,0.82))]"
                : "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(209,250,229,0.82))]";

          const badgeClass = isMine
            ? "bg-blue-100 text-blue-800"
            : isReserved
              ? "bg-rose-100 text-rose-800"
              : isExpired
                ? "bg-slate-200 text-slate-700"
                : "bg-emerald-100 text-emerald-800";

          const badgeText = isMine
            ? "Tu reserva"
            : isReserved
              ? "Ocupado"
              : isExpired
                ? "Vencido"
                : "Disponible";

          const helperText = isMine
            ? "Este horario está reservado para ti."
            : isReserved
              ? "Ya fue tomado por otro jugador."
              : isExpired
                ? "El horario ya quedó atrás."
                : "Puedes confirmarlo ahora desde esta misma tarjeta.";

          return (
            <article
              key={slot.id}
              className={`card overflow-hidden border p-5 transition ${cardClass}`}
            >
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-4 xl:flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                        Turno disponible
                      </p>
                      <h3 className="text-xl font-black tracking-tight text-slate-950">
                        {slot.courts?.name ?? "Cancha"}
                      </h3>
                    </div>

                    <span className={`status-badge ${badgeClass}`}>
                      {badgeText}
                    </span>
                  </div>

                  <div className="rounded-[24px] bg-white/72 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Horario
                    </p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                      {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                    </p>
                  </div>

                  {confirmedBooking ? (
                    <div className="flex items-center gap-3 rounded-[24px] bg-white/78 px-4 py-4 text-sm text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
                      <img
                        src={playerAvatar}
                        alt={playerName}
                        className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                      />
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Reserva activa
                        </p>
                        <p>
                          Jugador: <span className="font-semibold">{playerName}</span>
                        </p>
                        <p>
                          Categoría:{" "}
                          <span className="font-semibold">{playerCategory}</span>
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {!bookingWindowOpen && !isReserved && !isExpired ? (
                    <p className="text-sm text-amber-700">
                      Disponible desde las 22:00 del día anterior.
                    </p>
                  ) : null}

                  {isExpired && !isReserved ? (
                    <p className="text-sm text-slate-600">
                      Este turno ya pasó y no se puede reservar.
                    </p>
                  ) : null}

                  {profileComplete === false ? (
                    <p className="text-sm text-amber-700">
                      Completa tu perfil para poder reservar.
                    </p>
                  ) : null}

                  {isMine &&
                  confirmedBooking &&
                  !canCancelThisBooking &&
                  currentUserRole !== "admin" ? (
                    <p className="text-sm text-amber-700">
                      Solo puedes cancelar con más de 1 hora de anticipación.
                    </p>
                  ) : null}
                </div>

                <div className="flex w-full flex-col gap-3 xl:max-w-[240px]">
                  <div className="rounded-[24px] bg-white/72 px-4 py-4 text-sm text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
                    <p className="font-semibold text-slate-900">Estado del turno</p>
                    <p className="mt-1 leading-6">{helperText}</p>
                  </div>

                  {isMine && confirmedBooking ? (
                    <button
                      disabled={isCancelling || !canCancelThisBooking}
                      className="btn-secondary w-full border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
                      onClick={() => cancel(confirmedBooking.id)}
                    >
                      {isCancelling
                        ? "Cancelando..."
                        : !canCancelThisBooking
                          ? "No cancelable"
                          : "Cancelar reserva"}
                    </button>
                  ) : (
                    <button
                      disabled={disabled || pendingSlotId === slot.id}
                      className="btn-primary w-full"
                      onClick={() => requestReserveConfirmation(slot)}
                    >
                      {isReserved
                        ? "No disponible"
                        : isExpired
                          ? "Turno vencido"
                          : pendingSlotId === slot.id
                            ? "Reservando..."
                            : "Reservar"}
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {!slots.length ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-slate-600">No hay turnos para este día.</p>
          </div>
        ) : null}
      </div>

      <AppNoticeModal
        open={Boolean(noticeMessage)}
        message={noticeMessage}
        onClose={() => setNoticeMessage("")}
      />

      <AppConfirmModal
        open={Boolean(confirmingSlot)}
        title="Confirmar reserva"
        message={
          confirmingSlot
            ? `¿Quieres reservar ${confirmingSlot.courts?.name ?? "la cancha"} el ${formatReservationDate(confirmingSlot.slot_date)} de ${confirmingSlot.start_time.slice(0, 5)} a ${confirmingSlot.end_time.slice(0, 5)}?`
            : ""
        }
        confirmLabel="Reservar"
        cancelLabel="Volver"
        busy={Boolean(confirmingSlot && pendingSlotId === confirmingSlot.id)}
        onCancel={() => setConfirmingSlot(null)}
        onConfirm={() => {
          if (!confirmingSlot) return;
          void reserve(confirmingSlot.id);
          setConfirmingSlot(null);
        }}
      />
    </>
  );
}
