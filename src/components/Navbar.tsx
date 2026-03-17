"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession, signOut } from "@/lib/supabase";

export function Navbar() {
  const [mounted, setMounted] = useState(false);
  const [isLogged, setIsLogged] = useState(false);

  useEffect(() => {
    setMounted(true);

    function updateAuth() {
      setIsLogged(Boolean(getSession()?.access_token));
    }

    updateAuth();
    window.addEventListener("sr-auth-change", updateAuth);

    return () => {
      window.removeEventListener("sr-auth-change", updateAuth);
    };
  }, []);

  async function handleLogout() {
    await signOut();
    window.location.href = "/";
  }

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Squash Reservas" className="h-12 w-auto" />
          <span className="text-lg font-bold text-slate-900">
            Squash Reservas
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/schedule">Agenda</Link>
          <Link href="/my-bookings">Mis reservas</Link>
          <Link href="/courts">Canchas</Link>
          <Link href="/admin">Admin</Link>

          {!mounted ? (
            <span className="btn-secondary">Cargando...</span>
          ) : isLogged ? (
            <button onClick={handleLogout} className="btn-secondary">
              Salir
            </button>
          ) : (
            <Link href="/login" className="btn-primary">
              Ingresar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}