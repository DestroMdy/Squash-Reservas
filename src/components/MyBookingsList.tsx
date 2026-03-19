"use client";

import { useEffect, useState } from "react";
import { AppNoticeModal } from "../components/AppNoticeModal";
import { Booking, Profile } from "../types/db";
import { cancelBooking, fetchProfile, getSession } from "../lib/supabase";
import { canCancelBooking } from "../lib/time-rules";

function getBookingEndDateTime(booking: Booking) {
  const slotDate = booking.time_slots?.slot_date;
  const endTime = booking.time_slots?.end_time;

  if (!slotDate || !endTime) {
    return null;
  }

  return new Date(`${slotDate}T${endTime}`);
}

export function MyBookingsList({ bookings }: { bookings: Booking[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [noticeMessage, setNoticeMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const session = getSession();
      if (!session?.user?.id || !session?.access_token) return;

      const data = await fetchProfile(session.user.id, session.access_token);
      setProfile(data ?? null);
    }

    loadProfile();
  }, []);

  async function cancel(bookingId: string) {
    try {
      setLoadingId(bookingId);
      const token = getSession()?.access_token;
      if (!token) throw new Error("Debes iniciar sesión");
      await cancelBooking(bookingId, token);
      window.location.reload();
    } catch (error) {
      setNoticeMessage(
        error instanceof Error ? error.message : "No se pudo cancelar"
      );
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <>
      <div className="space-y-4">
        {profile ? (
          <div className="card rounded-2xl p-4">
            <p className="text-sm text-slate-500">Jugador</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {profile.full_name || "Sin nombre"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Categoría:{" "}
              <span className="font-medium">
                {profile.category || "Sin categoría"}
              </span>
            </p>
          </div>
        ) : null}

        {bookings.map((booking) => {
          const bookingEnd = getBookingEndDateTime(booking);
          const isPast = Boolean(bookingEnd && bookingEnd < new Date());
          const isCurrent = booking.status === "confirmed" && !isPast;
          const canCancelCurrentBooking =
            profile?.role === "admin"
              ? true
              : Boolean(
                  booking.time_slots?.slot_date &&
                    booking.time_slots?.start_time &&
                    canCancelBooking(
                      booking.time_slots.slot_date,
                      booking.time_slots.start_time
                    )
                );
          const cardClass = isCurrent
            ? "border-green-300 bg-green-50"
            : "border-slate-300 bg-slate-100";
          const badgeClass = isCurrent
            ? "bg-green-100 text-green-800"
            : "bg-slate-200 text-slate-700";
          const badgeText =
            booking.status === "cancelled"
              ? "Cancelada"
              : isPast
                ? "Finalizada"
                : "Vigente";

          return (
            <article
              key={booking.id}
              className={`card rounded-2xl border p-4 ${cardClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {booking.time_slots?.courts?.name ?? "Cancha"}
                  </p>

                  <p className="text-sm text-slate-600">
                    {booking.time_slots?.slot_date} ·{" "}
                    {booking.time_slots?.start_time.slice(0, 5)}
                  </p>

                  <p className="mt-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${badgeClass}`}
                    >
                      {badgeText}
                    </span>
                  </p>

                  {profile?.category ? (
                    <p className="mt-2 text-sm text-slate-600">
                      Tu categoría:{" "}
                      <span className="font-medium">{profile.category}</span>
                    </p>
                  ) : null}

                  {isCurrent && !canCancelCurrentBooking && profile?.role !== "admin" ? (
                    <p className="mt-2 text-sm text-amber-700">
                      La cancelación solo se permite con más de 1 hora de anticipación.
                    </p>
                  ) : null}
                </div>

                <button
                  className="btn-secondary"
                  disabled={
                    !isCurrent || !canCancelCurrentBooking || loadingId === booking.id
                  }
                  onClick={() => cancel(booking.id)}
                >
                  {loadingId === booking.id
                    ? "Cancelando..."
                    : !canCancelCurrentBooking && isCurrent
                      ? "No cancelable"
                      : "Cancelar"}
                </button>
              </div>
            </article>
          );
        })}

        {!bookings.length && (
          <p className="text-sm text-slate-600">No tienes reservas.</p>
        )}
      </div>

      <AppNoticeModal
        open={Boolean(noticeMessage)}
        message={noticeMessage}
        onClose={() => setNoticeMessage("")}
      />
    </>
  );
}
