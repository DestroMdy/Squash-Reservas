"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession } from "@/lib/supabase";

const quickActions = [
  { href: "/schedule", label: "Ver agenda", primary: true },
  { href: "/my-bookings", label: "Mis reservas" },
  { href: "/tournaments", label: "Torneos" }
];

export default function HomePage() {
  const [isLogged, setIsLogged] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    function updateAuthState() {
      const session = getSession();
      setIsLogged(Boolean(session?.access_token));
      setMounted(true);
    }

    updateAuthState();
    window.addEventListener("sr-auth-change", updateAuthState);

    return () => {
      window.removeEventListener("sr-auth-change", updateAuthState);
    };
  }, []);

  const heroActions = useMemo(() => {
    const baseActions = [...quickActions];
    if (mounted && !isLogged) {
      baseActions.unshift({ href: "/login", label: "Ingresar", primary: false });
    }
    if (isLogged) {
      baseActions.push({ href: "/profile", label: "Mi perfil" });
    }
    return baseActions;
  }, [isLogged, mounted]);

  return (
    <div className="mx-auto flex min-h-[74vh] max-w-5xl items-center">
      <section className="card relative w-full overflow-hidden p-6 sm:p-10">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_58%),radial-gradient(circle_at_top_right,_rgba(251,146,60,0.16),_transparent_44%)]" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_280px] lg:items-end">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="surface-pill inline-flex text-[11px] uppercase tracking-[0.28em] text-slate-500">
                <span className="font-dodger">La Martineta</span>
              </div>

              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">
                  Reservas simples para un club que se mueve rápido.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Organiza turnos, sigue tu actividad, conversa con otros jugadores
                  y encuentra torneos desde una sola app diseñada para usarse bien
                  en el celular.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {heroActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={`${action.primary ? "btn-primary" : "btn-secondary"} justify-center text-center`}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="soft-panel grid gap-4 p-5">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-slate-500">
                Experiencia móvil
              </p>
              <p className="text-2xl font-black tracking-tight text-slate-950">
                Clara, rápida y lista para usar.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-white/88 px-4 py-3">
                Agenda visual con estados más claros para cada turno.
              </div>
              <div className="rounded-2xl bg-white/88 px-4 py-3">
                Mensajes privados y grupos cerrados entre jugadores.
              </div>
              <div className="rounded-2xl bg-white/88 px-4 py-3">
                Panel admin, torneos externos y seguimiento del club.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
