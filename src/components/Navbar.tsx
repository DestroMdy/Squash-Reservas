"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchUnreadPrivateMessagesCount,
  getSession,
  getUser,
  signOut
} from "@/lib/supabase";

const ADMIN_EMAIL = "alann.freire@gmail.com";

const navItems = [
  { href: "/schedule", label: "Agenda" },
  { href: "/my-bookings", label: "Mis reservas" },
  { href: "/messages", label: "Mensajes" },
  { href: "/profile", label: "Mi perfil" },
  { href: "/players", label: "Jugadores" },
  { href: "/courts", label: "Canchas" }
];

export function Navbar() {
  const [mounted, setMounted] = useState(false);
  const [isLogged, setIsLogged] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setMounted(true);
    let intervalId: number | null = null;

    async function updateAuth() {
      const session = getSession();
      setIsLogged(Boolean(session?.access_token));
      setIsAdminUser(session?.user?.email === ADMIN_EMAIL);

      if (!session?.access_token) {
        setUnreadCount(0);
        return;
      }

      const user = await getUser(session.access_token);
      if (!user) {
        setUnreadCount(0);
        return;
      }

      try {
        const count = await fetchUnreadPrivateMessagesCount(
          user.id,
          session.access_token
        );
        setUnreadCount(count);
      } catch {
        setUnreadCount(0);
      }
    }

    void updateAuth();
    window.addEventListener("sr-auth-change", updateAuth);
    window.addEventListener("sr-messages-updated", updateAuth);

    intervalId = window.setInterval(() => {
      void updateAuth();
    }, 30000);

    return () => {
      window.removeEventListener("sr-auth-change", updateAuth);
      window.removeEventListener("sr-messages-updated", updateAuth);
      if (intervalId) {
        window.clearInterval(intervalId);
      }
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
                className="btn-secondary relative whitespace-nowrap"
              >
                {item.label}
                {item.href === "/messages" && unreadCount > 0 ? (
                  <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
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
