"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSession, signOut } from "@/lib/supabase";

const ADMIN_EMAIL = "alann.freire@gmail.com";

const navItems = [
  { href: "/schedule", label: "Agenda" },
  { href: "/my-bookings", label: "Mis reservas" },
  { href: "/profile", label: "Mi perfil" },
  { href: "/players", label: "Jugadores" },
  { href: "/courts", label: "Canchas" }
];

export function Navbar() {
  const [mounted, setMounted] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    setMounted(true);

    function updateAuth() {
      const session = getSession();
      setIsLogged(Boolean(session?.access_token));
      setIsAdminUser(session?.user?.email === ADMIN_EMAIL);
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
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <img
              src="/logo.png"
              alt="Squash Reservas"
              className="h-12 w-12 shrink-0 rounded-xl object-contain"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                La Martineta
              </p>
              <p className="truncate text-xl font-bold leading-tight text-slate-900">
                Squash Reservas
              </p>
            </div>
          </Link>

          {!mounted ? (
            <span className="btn-secondary shrink-0">Cargando...</span>
          ) : isLogged ? (
            <button onClick={handleLogout} className="btn-secondary shrink-0">
              Salir
            </button>
          ) : (
            <Link href="/login" className="btn-primary shrink-0">
              Ingresar
            </Link>
          )}
        </div>

        <nav className="-mx-4 mt-3 overflow-x-auto px-4 pb-1">
          <div className="flex min-w-max gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="btn-secondary whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
            {isAdminUser ? (
              <Link href="/admin" className="btn-secondary whitespace-nowrap">
                Admin
              </Link>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
