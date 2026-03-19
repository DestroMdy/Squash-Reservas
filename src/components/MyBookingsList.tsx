"use client";

import { useEffect, useMemo, useState } from "react";
import { AppNoticeModal } from "@/components/AppNoticeModal";
import { cancelBooking, fetchProfile, getSession } from "@/lib/supabase";
import { canCancelBooking } from "@/lib/time-rules";
import { Booking, Profile } from "@/types/db";

function getBookingStartDateTime(booking: Booking) {
  const slotDate = booking.time_slots?.slot_date;
  const startTime = booking.time_slots?.start_time;

  if (!slotDate || !startTime) {
    return null;
  }

  return new Date(`${slotDate}T${startTime}`);
}

function getBookingEndDateTime(booking: Booking) {
  const slotDate = booking.time_slots?.slot_date;
  const endTime = booking.time_slots?.end_time;

  if (!slotDate || !endTime) {
    return null;
  }

  return new Date(`${slotDate}T${endTime}`);
}

function formatBookingDate(date: string | undefined) {
  if (!date) return "Sin fecha";

  const formatted = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(`${date}T12:00:00`));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatBookingTime(booking: Booking) {
  return `${booking.time_slots?.start_time?.slice(0, 5) ?? "--:--"} - ${booking.time_slots?.end_time?.slice(0, 5) ?? "--:--"}`;
}

function getBookingState(booking: Booking) {
  const bookingEnd = getBookingEndDateTime(booking);
  const isPast = Boolean(bookingEnd && bookingEnd < new Date());

  if (booking.status === "cancelled") {
    return "cancelled";
  }

  if (isPast) {
    return "past";
  }

  return "upcoming";
}

function BookingCard({
  booking,
  role,
  loadingId,
  onCancel
}: {
  booking: Booking;
  role: Profile["role"] | undefined;
  loadingId: string | null;
  onCancel: (bookingId: string) => void;
}) {
  const state = getBookingState(booking);
  const isUpcoming = state === "upcoming";
  const canCancelCurrentBooking =
    role === "admin"
      ? isUpcoming
      : Boolean(
          isUpcoming &&
            booking.time_slots?.slot_date &&
            booking.time_slots?.start_time &&
            canCancelBooking(
              booking.time_slots.slot_date,
              booking.time_slots.start_time
            )
        );

  const cardClass =
    state === "upcoming"
      ? "border-green-300 bg-green-50"
      : "border-slate-300 bg-slate-100";
  const badgeClass =
    state === "upcoming"
      ? "bg-green-100 text-green-800"
      : "bg-slate-200 text-slate-700";
  const badgeText =
    state === "cancelled"
      ? "Cancelada"
      : state === "past"
        ? "Finalizada"
        : "Próxima";

  return (
    <article className={`card rounded-2xl border p-4 ${cardClass}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-slate-900">
              {booking.time_slots?.courts?.name ?? "Cancha"}
            </p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${badgeClass}`}
            >
              {badgeText}
            </span>
          </div>

          <p className="text-sm font-medium text-slate-700">
            {formatBookingDate(booking.time_slots?.slot_date)}
          </p>
          <p className="text-sm text-slate-600">{formatBookingTime(booking)}</p>

          {isUpcoming && !canCancelCurrentBooking && role !== "admin" ? (
            <p className="text-sm text-amber-700">
              La cancelación solo se permite con más de 1 hora de anticipación.
            </p>
          ) : null}
        </div>

        {canCancelCurrentBooking ? (
          <button
            className="btn-primary w-full sm:w-auto"
            disabled={loadingId === booking.id}
            onClick={() => onCancel(booking.id)}
          >
            {loadingId === booking.id ? "Cancelando..." : "Cancelar reserva"}
          </button>
        ) : isUpcoming ? (
          <div className="text-sm text-slate-500">
            No cancelable
          </div>
        ) : null}
      </div>
    </article>
  );
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

    void loadProfile();
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

  const { nextBooking, historyBookings } = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      const aStart = getBookingStartDateTime(a)?.getTime() ?? 0;
      const bStart = getBookingStartDateTime(b)?.getTime() ?? 0;
      return aStart - bStart;
    });

    const upcoming = sorted.filter((booking) => getBookingState(booking) === "upcoming");
    const history = [...sorted]
      .filter((booking) => getBookingState(booking) !== "upcoming")
      .sort((a, b) => {
        const aStart = getBookingStartDateTime(a)?.getTime() ?? 0;
        const bStart = getBookingStartDateTime(b)?.getTime() ?? 0;
        return bStart - aStart;
      });

    return {
      nextBooking: upcoming[0] ?? null,
      historyBookings: history
    };
  }, [bookings]);

  return (
    <>
      <div className="space-y-5">
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

        {nextBooking ? (
          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Próxima reserva
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Tu próximo turno confirmado aparece destacado acá.
              </p>
            </div>

            <BookingCard
              booking={nextBooking}
              role={profile?.role}
              loadingId={loadingId}
              onCancel={cancel}
            />
          </section>
        ) : null}

        {historyBookings.length ? (
          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Historial
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Reservas canceladas o ya pasadas.
              </p>
            </div>

            <div className="space-y-4">
              {historyBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  role={profile?.role}
                  loadingId={loadingId}
                  onCancel={cancel}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!nextBooking && !historyBookings.length ? (
          <p className="text-sm text-slate-600">No tienes reservas.</p>
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
