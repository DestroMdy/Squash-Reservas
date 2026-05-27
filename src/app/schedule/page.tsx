"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ScheduleGrid } from "../../components/ScheduleGrid";
import { SectionTitle } from "../../components/SectionTitle";
import { fetchSlotsByDate } from "../../lib/supabase";
import { Booking, Court, TimeSlot } from "../../types/db";

type SlotWithRelations = TimeSlot & {
  courts?: Court;
  bookings?: Pick<Booking, "id" | "status" | "user_id">[] | null;
};

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().split("T")[0];
}

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => todayLocalDate());
  const [slots, setSlots] = useState<SlotWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDate) return;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchSlotsByDate(selectedDate);
        setSlots(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la agenda");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedDate]);

  const sortedSlots = useMemo(() => {
    return [...slots].sort((a, b) => {
      if (a.start_time < b.start_time) return -1;
      if (a.start_time > b.start_time) return 1;

      const courtA = a.courts?.name ?? "";
      const courtB = b.courts?.name ?? "";
      return courtA.localeCompare(courtB);
    });
  }, [slots]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="btn-secondary">
          ← Volver al inicio
        </Link>
      </div>

      <SectionTitle
        title="Agenda de turnos"
        subtitle="Elegí una fecha y reservá tu cancha."
      />

      <section className="card p-4">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Fecha
        </label>

        <input
          type="date"
          className="rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </section>

      {loading ? <p className="text-sm text-slate-600">Cargando agenda...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <ScheduleGrid slots={sortedSlots} selectedDate={selectedDate} />
      ) : null}
    </div>
  );
}
