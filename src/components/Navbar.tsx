"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  fetchUnreadPrivateMessagesCount,
  fetchProfileRole,
  getSession,
  getUser,
  signOut
} from "@/lib/supabase";

const navItems = [
  { href: "/schedule", label: "Agenda" },
  { href: "/my-bookings", label: "Mis reservas" },
  { href: "/messages", label: "Mensajes" },
  { href: "/tournaments", label: "Torneos" },
  { href: "/profile", label: "Mi perfil" },
  { href: "/players", label: "Jugadores" },
  { href: "/courts", label: "Canchas" }
];

export function Navbar() {
  const pathname = usePathname();
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

      if (!session?.access_token) {
        setIsAdminUser(false);
        setUnreadCount(0);
        return;
      }

      const user = session.user?.id
        ? session.user
        : await getUser(session.access_token);
      if (!user) {
        setIsAdminUser(false);
        setUnreadCount(0);
        return;
      }

      try {
        const role = await fetchProfileRole(user.id, session.access_token);
        setIsAdminUser(role === "admin");
        const count = await fetchUnreadPrivateMessagesCount(
          user.id,
          session.access_token
        );
        setUnreadCount(count);
      } catch {
        setIsAdminUser(false);
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
    <header className="border-b border-orange-500/40 bg-black text-white shadow-[0_14px_34px_-22px_rgba(0,0,0,0.9)]">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <img
              src="/logo.png"
              alt="Squash Reservas"
              className="h-12 w-12 shrink-0 rounded-xl bg-white/95 p-1 object-contain"
            />
            <div className="min-w-0">
              <p className="font-dodger truncate text-sm text-white/75">
                La Martineta
              </p>
              <p className="truncate text-xl font-bold leading-tight text-white">
                Squash Reservas
              </p>
            </div>
          </Link>

          {!mounted ? (
            <span className="shrink-0 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white/80">
              Cargando...
            </span>
          ) : isLogged ? (
            <button
              onClick={handleLogout}
              className="shrink-0 rounded-xl border border-orange-400/60 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-50"
            >
              Salir
            </button>
          ) : (
            <Link
              href="/login"
              className="shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
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
                className="relative whitespace-nowrap rounded-xl border border-white/15 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-orange-400 hover:text-black"
              >
                {item.label}
                {item.href === "/messages" &&
                unreadCount > 0 &&
                pathname !== "/messages" ? (
                  <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-orange-500 px-2 py-0.5 text-xs font-semibold text-black">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            ))}
            {isAdminUser ? (
              <Link
                href="/admin"
                className="whitespace-nowrap rounded-xl border border-orange-400/70 bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Admin
              </Link>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
