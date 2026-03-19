"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ScheduleGrid } from "@/components/ScheduleGrid";
import { SectionTitle } from "@/components/SectionTitle";
import {
  fetchProfileRole,
  fetchSlotsByDate,
  getSession,
  getUser
} from "@/lib/supabase";
import { isPastSlot, isSlotWithinClubHours } from "@/lib/time-rules";
import { Booking, Court, TimeSlot } from "@/types/db";

type SlotWithRelations = TimeSlot & {
  courts?: Court;
  bookings?: Pick<Booking, "id" | "status" | "user_id">[];
};

function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().split("T")[0];
}

function tomorrowLocalDate() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().split("T")[0];
}

export default function SchedulePage() {
  const [mounted, setMounted] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [slots, setSlots] = useState<SlotWithRelations[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setSelectedDate(todayLocalDate());
  }, []);

  useEffect(() => {
    if (!mounted || !selectedDate) return;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const token = getSession()?.access_token;
        let adminUser = false;

        if (token) {
          const user = await getUser(token);
          if (user) {
            const role = await fetchProfileRole(user.id, token);
            adminUser = role === "admin";
          }
        }

        setIsAdmin(adminUser);
        const data = await fetchSlotsByDate(selectedDate, token);
        setSlots(
          (data ?? []).filter((slot) =>
            adminUser ? true : !isPastSlot(slot.slot_date, slot.end_time)
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la agenda");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [mounted, selectedDate]);

  const sortedSlots = useMemo(() => {
    return [...slots]
      .filter((slot) =>
        isSlotWithinClubHours(slot.slot_date, slot.start_time, slot.end_time)
      )
      .sort((a, b) => {
        if (a.start_time < b.start_time) return -1;
        if (a.start_time > b.start_time) return 1;

        const courtA = a.courts?.name ?? "";
        const courtB = b.courts?.name ?? "";
        return courtA.localeCompare(courtB);
      });
  }, [slots]);

  const tomorrow = useMemo(() => tomorrowLocalDate(), []);

  if (!mounted) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="btn-secondary">
          Volver al inicio
        </Link>
        {isAdmin ? (
          <span className="surface-pill text-xs uppercase tracking-[0.22em] text-slate-500">
            Vista admin con turnos vencidos
          </span>
        ) : null}
      </div>

      <SectionTitle
        title="Agenda de turnos"
        subtitle="Elige una fecha, revisa la disponibilidad y reserva con una vista más clara para móvil."
      />

      <section className="card overflow-hidden p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">
              Buscar fecha
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="date"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-700 outline-none transition focus:border-slate-400 sm:max-w-xs"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedDate(tomorrow)}
              >
                Ir a mañana
              </button>
            </div>
          </div>

          <div className="soft-panel p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Tip rápido</p>
            <p className="mt-2 leading-6">
              Los turnos se ordenan por horario y cancha para que encontrar tu
              lugar disponible lleve menos tiempo.
            </p>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="soft-panel px-4 py-5 text-sm text-slate-600">
          Cargando agenda...
        </div>
      ) : null}
      {error ? (
        <div className="soft-panel border-red-200 bg-red-50/80 px-4 py-5 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error ? (
        <ScheduleGrid slots={sortedSlots} selectedDate={selectedDate} />
      ) : null}
    </div>
  );
}
