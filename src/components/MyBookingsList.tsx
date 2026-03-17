"use client";

import { useEffect, useState } from "react";
import { Booking, Profile } from "../types/db";
import {
  cancelBooking,
  fetchProfile,
  getSession
} from "../lib/supabase";

export function MyBookingsList({ bookings }: { bookings: Booking[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

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
      alert(error instanceof Error ? error.message : "No se pudo cancelar");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {profile ? (
        <div className="card rounded-2xl p-4">
          <p className="text-sm text-slate-500">Jugador</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {profile.full_name || "Sin nombre"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Categoría: <span className="font-medium">{profile.category || "Sin categoría"}</span>
          </p>
        </div>
      ) : null}

      {bookings.map((booking) => (
        <article key={booking.id} className="card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {booking.time_slots?.courts?.name ?? "Cancha"}
              </p>

              <p className="text-sm text-slate-600">
                {booking.time_slots?.slot_date} · {booking.time_slots?.start_time.slice(0, 5)}
              </p>

              <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                {booking.status}
              </p>

              {profile?.category ? (
                <p className="mt-2 text-sm text-slate-600">
                  Tu categoría: <span className="font-medium">{profile.category}</span>
                </p>
              ) : null}
            </div>

            <button
              className="btn-secondary"
              disabled={booking.status !== "confirmed" || loadingId === booking.id}
              onClick={() => cancel(booking.id)}
            >
              {loadingId === booking.id ? "Cancelando..." : "Cancelar"}
            </button>
          </div>
        </article>
      ))}

      {!bookings.length && (
        <p className="text-sm text-slate-600">No tienes reservas.</p>
      )}
    </div>
  );
}