"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cancelBooking, getSession, isProfileComplete } from "../lib/supabase";
import { canBookSlot } from "../lib/time-rules";
import { Booking, Court, TimeSlot } from "../types/db";

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
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  const canBookDate = useMemo(() => canBookSlot(selectedDate), [selectedDate]);

  useEffect(() => {
    async function loadSessionData() {
      const session = getSession();
      const userId = session?.user?.id ?? null;
      const token = session?.access_token;

      setCurrentUserId(userId);

      if (userId && token) {
        const complete = await isProfileComplete(userId, token);
        setProfileComplete(complete);
      } else {
        setProfileComplete(false);
      }
    }

    loadSessionData();
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
      alert(error instanceof Error ? error.message : "Error al reservar");
    } finally {
      setPendingSlotId(null);
    }
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
      alert(error instanceof Error ? error.message : "No se pudo cancelar");
    } finally {
      setPendingCancelId(null);
    }
  }

  return (
    <div className="space-y-4">
      {profileComplete === false ? (
        <div className="card rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">
            Debes completar tu perfil antes de reservar.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            Completá nombre, teléfono y categoría.
          </p>
          <div className="mt-3">
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

        const disabled =
          isReserved || !canBookDate || profileComplete === false;

        const cardClass = isMine
          ? "border-blue-300 bg-blue-50"
          : isReserved
            ? "border-red-300 bg-red-50"
            : "border-green-300 bg-green-50";

        const badgeClass = isMine
          ? "bg-blue-100 text-blue-800"
          : isReserved
            ? "bg-red-100 text-red-800"
            : "bg-green-100 text-green-800";

        const badgeText = isMine
          ? "Tu reserva"
          : isReserved
            ? "Ocupado"
            : "Disponible";

        const isCancelling = pendingCancelId === confirmedBooking?.id;
        const playerName = confirmedBooking?.profiles?.full_name?.trim() || "Sin nombre";
        const playerCategory =
          confirmedBooking?.profiles?.category?.trim() || "Sin categoría";
        const playerAvatar = confirmedBooking?.profiles?.avatar_url || "/icon-192.png";

        return (
          <article
            key={slot.id}
            className={`card rounded-2xl border p-5 shadow-sm transition ${cardClass}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {slot.courts?.name ?? "Cancha"}
                  </h3>

                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${badgeClass}`}
                  >
                    {badgeText}
                  </span>
                </div>

                <p className="text-base font-medium text-slate-700">
                  {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                </p>

                <p className="text-sm text-slate-500">
                  Precio: ${Number(slot.price || 0).toLocaleString("es-AR")}
                </p>

                {confirmedBooking ? (
                  <div className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-3 text-sm text-slate-700">
                    <img
                      src={playerAvatar}
                      alt={playerName}
                      className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                    />
                    <div>
                      <p>
                        Jugador: <span className="font-medium">{playerName}</span>
                      </p>
                      <p>
                        Categoría: <span className="font-medium">{playerCategory}</span>
                      </p>
                    </div>
                  </div>
                ) : null}

                {!canBookDate && !isReserved ? (
                  <p className="text-sm text-amber-700">
                    Disponible desde las 22:00 del día anterior
                  </p>
                ) : null}

                {profileComplete === false ? (
                  <p className="text-sm text-amber-700">
                    Completa tu perfil para poder reservar.
                  </p>
                ) : null}
              </div>

              <div className="sm:min-w-[160px]">
                {isMine && confirmedBooking ? (
                  <button
                    disabled={isCancelling}
                    className="btn-secondary w-full border-blue-300 bg-white text-blue-700 hover:bg-blue-100"
                    onClick={() => cancel(confirmedBooking.id)}
                  >
                    {isCancelling ? "Cancelando..." : "Cancelar reserva"}
                  </button>
                ) : (
                  <button
                    disabled={disabled || pendingSlotId === slot.id}
                    className="btn-primary w-full"
                    onClick={() => reserve(slot.id)}
                  >
                    {isReserved
                      ? "No disponible"
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

      {!slots.length && (
        <div className="card rounded-2xl p-6 text-center">
          <p className="text-sm text-slate-600">No hay turnos para este día.</p>
        </div>
      )}
    </div>
  );
}
