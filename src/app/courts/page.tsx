"use client";

import { FormEvent, useEffect, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import { Court } from "@/types/db";
import { createCourt, fetchCourts, fetchProfileRole, getSession, getUser } from "@/lib/supabase";

export default function CourtsPage() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadCourts() {
    const token = getSession()?.access_token;
    const data = await fetchCourts(token);
    setCourts(data);
  }

  useEffect(() => {
    async function init() {
      try {
        await loadCourts();

        const token = getSession()?.access_token;
        if (!token) return;

        const user = await getUser(token);
        if (!user) return;

        const role = await fetchProfileRole(user.id, token);
        setIsAdmin(role === "admin");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "No se pudieron cargar las canchas");
      }
    }

    init();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const token = getSession()?.access_token;
      if (!token) throw new Error("Debes iniciar sesión");
      if (!name.trim()) throw new Error("Ingresa un nombre");

      await createCourt(name.trim(), token);
      setName("");
      setMessage("Cancha creada correctamente");
      await loadCourts();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo crear la cancha");
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Canchas"
        subtitle="Listado de canchas disponibles del club."
      />

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}

      <div className="space-y-3">
        {courts.map((court) => (
          <article key={court.id} className="card p-4">
            <p className="font-semibold">{court.name}</p>
            <p className="text-sm text-slate-600">
              {court.is_active ? "Activa" : "Inactiva"}
            </p>
          </article>
        ))}
      </div>

      {isAdmin ? (
        <section className="card p-4">
          <h2 className="mb-3 text-lg font-semibold">Agregar cancha</h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
              placeholder="Nombre de la cancha"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="btn-primary">
              Crear
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}