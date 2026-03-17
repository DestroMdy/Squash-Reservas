"use client";

import { useEffect, useState } from "react";
import { MyBookingsList } from "@/components/MyBookingsList";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchMyBookings, getSession, getUser } from "@/lib/supabase";
import { Booking } from "@/types/db";

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const token = getSession()?.access_token;
        if (!token) {
          setError("Debes iniciar sesión");
          return;
        }

        const user = await getUser(token);
        if (!user) {
          setError("Sesión inválida");
          return;
        }

        const data = await fetchMyBookings(user.id, token);
        setBookings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las reservas");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Mis reservas"
        subtitle="Consultá tus turnos confirmados y cancelá cuando lo necesites."
      />

      {loading ? <p>Cargando reservas...</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!loading && !error ? <MyBookingsList bookings={bookings} /> : null}
    </div>
  );
}