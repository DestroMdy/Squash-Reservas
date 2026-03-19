"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  fetchUnreadPrivateMessagesCount,
  fetchProfileRole,
  getSession,
  getUser,
  signOut
} from "@/lib/supabase";

const navItems = [
  { href: "/schedule", label: "Agenda", shortLabel: "Agenda" },
  { href: "/my-bookings", label: "Mis reservas", shortLabel: "Reservas" },
  { href: "/messages", label: "Mensajes", shortLabel: "Mensajes" },
  { href: "/tournaments", label: "Torneos", shortLabel: "Torneos" },
  { href: "/profile", label: "Mi perfil", shortLabel: "Perfil" },
  { href: "/players", label: "Jugadores", shortLabel: "Club" },
  { href: "/courts", label: "Canchas", shortLabel: "Canchas" }
];

function navIsActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

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

  const visibleItems = useMemo(() => {
    return isAdminUser
      ? [...navItems, { href: "/admin", label: "Admin", shortLabel: "Admin" }]
      : navItems;
  }, [isAdminUser]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/65 bg-[rgba(244,248,252,0.78)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-white/80 bg-white/88 shadow-[0_18px_34px_-24px_rgba(15,23,42,0.45)]">
              <img
                src="/logo.png"
                alt="Squash Reservas"
                className="h-11 w-11 object-contain"
              />
            </div>

            <div className="min-w-0">
              <p className="font-dodger truncate text-xs text-slate-500 sm:text-sm">
                La Martineta
              </p>
              <p className="truncate text-[1.65rem] font-black leading-none tracking-tight text-slate-950 sm:text-[2rem]">
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

        <div className="mx-auto hidden max-w-[1120px] px-4 pb-4 sm:block sm:px-6">
          <nav className="soft-panel overflow-x-auto px-3 py-3">
            <div className="flex min-w-max items-center gap-2">
              {visibleItems.map((item) => {
                const isActive = navIsActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                      isActive
                        ? "bg-slate-900 text-white shadow-[0_18px_28px_-18px_rgba(15,23,42,0.78)]"
                        : "bg-white/78 text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.href === "/messages" && unreadCount > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/92 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-18px_40px_-30px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-[1120px] gap-2 overflow-x-auto pb-1">
          {visibleItems.map((item) => {
            const isActive = navIsActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-w-[92px] shrink-0 flex-col items-center justify-center rounded-2xl px-3 py-2.5 text-center text-[11px] font-semibold transition ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100/88 text-slate-600"
                }`}
              >
                <span>{item.shortLabel}</span>
                {item.href === "/messages" && unreadCount > 0 ? (
                  <span className="absolute right-2 top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
