"use client";

import Link from "next/link";
import Image from "next/image";
import { useSyncExternalStore } from "react";
import { getSession, signOut } from "@/lib/supabase";

function subscribeToAuthChange(onStoreChange: () => void) {
  window.addEventListener("sr-auth-change", onStoreChange);
  return () => window.removeEventListener("sr-auth-change", onStoreChange);
}

function getAuthSnapshot() {
  return Boolean(getSession()?.access_token);
}

export function Navbar() {
  const isLogged = useSyncExternalStore(
    subscribeToAuthChange,
    getAuthSnapshot,
    () => false
  );

  async function handleLogout() {
    await signOut();
    window.location.href = "/";
  }

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="Squash Reservas"
            width={43}
            height={48}
            className="h-12 w-auto"
            priority
          />
          <span className="text-lg font-bold text-slate-900">
            Squash Reservas
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link href="/schedule">Agenda</Link>
          <Link href="/my-bookings">Mis reservas</Link>
          <Link href="/courts">Canchas</Link>
          <Link href="/admin">Admin</Link>

          {isLogged ? (
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
