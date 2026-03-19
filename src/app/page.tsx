"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/supabase";

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

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
      <section className="card w-full p-8 sm:p-10">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            La Martineta
          </p>
          <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
            Squash Reservas
          </h1>
          <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
            Reserva canchas, revisa tus turnos y administra tu perfil desde el
            celular.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {!mounted ? null : !isLogged ? (
            <Link href="/login" className="btn-primary text-center">
              Ingresar
            </Link>
          ) : null}
          <Link
            href={isLogged ? "/schedule" : "/schedule"}
            className={`${!mounted || !isLogged ? "btn-secondary" : "btn-primary"} text-center`}
          >
            Ver agenda
          </Link>
          <Link href="/my-bookings" className="btn-secondary text-center">
            Mis reservas
          </Link>
          <Link href="/tournaments" className="btn-secondary text-center">
            Torneos
          </Link>
          {isLogged ? (
            <Link href="/profile" className="btn-secondary text-center">
              Mi perfil
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
