"use client";

import { useEffect, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { fetchBookingStats, fetchProfileRole, getSession, getUser } from "@/lib/supabase";

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; confirmed: number; cancelled: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
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

        const currentRole = await fetchProfileRole(user.id, token);
        setRole(currentRole ?? null);

        if (currentRole !== "admin") {
          setError("No tienes permisos de administrador");
          return;
        }

        const bookingStats = await fetchBookingStats(token);
        setStats(bookingStats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el panel");
      }
    }

    load();
  }, []);

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Panel administrador"
        subtitle="Resumen general de reservas."
      />

      {error ? <p className="text-red-600">{error}</p> : null}

      {!error && role === "admin" && stats ? (
        <div className="grid gap-4 md:grid-cols-3">
          <article className="card p-4">
            <p className="text-sm text-slate-500">Reservas totales</p>
            <p className="mt-2 text-3xl font-bold">{stats.total}</p>
          </article>

          <article className="card p-4">
            <p className="text-sm text-slate-500">Confirmadas</p>
            <p className="mt-2 text-3xl font-bold">{stats.confirmed}</p>
          </article>

          <article className="card p-4">
            <p className="text-sm text-slate-500">Canceladas</p>
            <p className="mt-2 text-3xl font-bold">{stats.cancelled}</p>
          </article>
        </div>
      ) : null}
    </div>
  );
}