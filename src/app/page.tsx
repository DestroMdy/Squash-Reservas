"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  fetchExternalTournaments,
  fetchMyBookings,
  fetchProfile,
  getSession
} from "@/lib/supabase";

type NextBooking = {
  id: string;
  status: string;
  courts?: { name?: string | null } | null;
  time_slots?: {
    slot_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
  } | null;
};

type HomeProfile = {
  full_name?: string | null;
  avatar_url?: string | null;
};

type HomeTournament = {
  id: string;
  title: string;
  event_date?: string | null;
  location?: string | null;
};

function getBookingMarker(booking: NextBooking) {
  const slotDate = booking.time_slots?.slot_date;
  const startTime = booking.time_slots?.start_time;

  if (!slotDate || !startTime) {
    return Number.MAX_SAFE_INTEGER;
  }

  return new Date(`${slotDate}T${startTime}`).getTime();
}

function formatBookingDate(date: string | null | undefined) {
  if (!date) return "Fecha a confirmar";

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date(`${date}T12:00:00`));
}

function formatTournamentDate(date: string | null | undefined) {
  if (!date) return "Fecha a confirmar";

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long"
  }).format(new Date(`${date}T12:00:00`));
}

export default function HomePage() {
  const [isLogged, setIsLogged] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profile, setProfile] = useState<HomeProfile | null>(null);
  const [nextBooking, setNextBooking] = useState<NextBooking | null>(null);
  const [featuredTournament, setFeaturedTournament] =
    useState<HomeTournament | null>(null);

  useEffect(() => {
    async function updateAuthState() {
      const session = getSession();
      const token = session?.access_token;
      const userId = session?.user?.id;
      const logged = Boolean(token && userId);

      setIsLogged(logged);
      setMounted(true);

      if (!logged || !token || !userId) {
        setProfile(null);
        setNextBooking(null);
      } else {
        try {
          const [profileData, bookings] = await Promise.all([
            fetchProfile(userId, token),
            fetchMyBookings(userId, token)
          ]);

          const now = Date.now();
          const upcomingBooking =
            (bookings ?? [])
              .filter((booking) => booking.status === "confirmed")
              .sort(
                (a, b) =>
                  getBookingMarker(a as NextBooking) -
                  getBookingMarker(b as NextBooking)
              )
              .find((booking) => getBookingMarker(booking as NextBooking) >= now) ??
            null;

          setProfile(profileData ?? null);
          setNextBooking((upcomingBooking as NextBooking | null) ?? null);
        } catch {
          setProfile(null);
          setNextBooking(null);
        }
      }

      try {
        const tournaments = (await fetchExternalTournaments()) as HomeTournament[];
        const today = new Date();
        const todayMarker = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        ).getTime();

        const nextTournament =
          tournaments
            .filter((tournament) => {
              if (!tournament.event_date) return false;
              const date = new Date(`${tournament.event_date}T12:00:00`);
              const marker = new Date(
                date.getFullYear(),
                date.getMonth(),
                date.getDate()
              ).getTime();
              return marker >= todayMarker;
            })
            .sort((a, b) => {
              const aMarker = new Date(`${a.event_date}T12:00:00`).getTime();
              const bMarker = new Date(`${b.event_date}T12:00:00`).getTime();
              return aMarker - bMarker;
            })[0] ?? null;

        setFeaturedTournament(nextTournament);
      } catch {
        setFeaturedTournament(null);
      }
    }

    void updateAuthState();
    window.addEventListener("sr-auth-change", updateAuthState);

    return () => {
      window.removeEventListener("sr-auth-change", updateAuthState);
    };
  }, []);

  const greetingName = useMemo(() => {
    const fullName = profile?.full_name?.trim();
    if (!fullName) return null;
    return fullName.split(" ")[0];
  }, [profile]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-5xl items-start">
      <section className="w-full space-y-5">
        <div className="card dashboard-accent animate-fade-up w-full p-8 sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="font-dodger text-sm text-slate-500">La Martineta</p>
              <div className="space-y-3">
                <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
                  Squash Reservas
                </h1>
                <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
                  Reserva canchas, revisa tus turnos y administra tu perfil desde
                  el celular.
                </p>
              </div>
            </div>

            {isLogged ? (
              <div className="animate-pop-in flex items-center gap-3 rounded-2xl border border-orange-200 bg-white/90 px-4 py-3 shadow-sm">
                <img
                  src={profile?.avatar_url || "/icon-192.png"}
                  alt={profile?.full_name || "Tu perfil"}
                  className="h-14 w-14 rounded-full border border-orange-200 object-cover"
                />
                <div>
                  <p className="text-sm text-slate-500">Hola{greetingName ? "," : ""}</p>
                  <p className="text-lg font-semibold text-slate-950">
                    {greetingName || "Jugador"}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {!mounted ? null : !isLogged ? (
              <Link href="/login" className="btn-primary text-center">
                Ingresar
              </Link>
            ) : null}
            <Link href="/schedule" className="btn-accent text-center">
              Reserva aquí
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
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <article className="card animate-fade-up p-6" style={{ animationDelay: "80ms" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Tu próximo turno
            </p>
            {isLogged ? (
              nextBooking ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-950">
                        {nextBooking.courts?.name || "Cancha"}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatBookingDate(nextBooking.time_slots?.slot_date)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      Confirmada
                    </span>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <p className="text-2xl font-black tracking-tight text-slate-950">
                      {nextBooking.time_slots?.start_time?.slice(0, 5)} -{" "}
                      {nextBooking.time_slots?.end_time?.slice(0, 5)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Tu próximo turno aparece acá para que entres directo a gestionarlo.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link href="/my-bookings" className="btn-primary text-center">
                      Ver mi reserva
                    </Link>
                    <Link href="/schedule" className="btn-secondary text-center">
                      Buscar otro horario
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
                  <p className="text-base font-medium text-slate-900">
                    Todavía no tenés una próxima reserva.
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Si ves un horario libre, podés reservarlo en unos segundos.
                  </p>
                  <div className="mt-4">
                    <Link href="/schedule" className="btn-accent text-center">
                      Reservar ahora
                    </Link>
                  </div>
                </div>
              )
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
                <p className="text-base font-medium text-slate-900">
                  Iniciá sesión para ver tu próxima reserva.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Vas a tener tu próximo turno, mensajes y accesos rápidos en un solo lugar.
                </p>
                <div className="mt-4">
                  <Link href="/login" className="btn-primary text-center">
                    Entrar a mi cuenta
                  </Link>
                </div>
              </div>
            )}
          </article>

          <article className="card animate-fade-up p-6" style={{ animationDelay: "140ms" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Próximo torneo
            </p>
            {featuredTournament ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-black px-4 py-4 text-white shadow-sm">
                  <p className="font-dodger text-xs text-orange-300">La Martineta</p>
                  <h2 className="mt-3 text-2xl font-bold leading-tight">
                    {featuredTournament.title}
                  </h2>
                  <p className="mt-3 text-sm text-slate-300">
                    {formatTournamentDate(featuredTournament.event_date)}
                  </p>
                  <p className="mt-1 text-sm text-orange-300">
                    {featuredTournament.location || "Sede a confirmar"}
                  </p>
                </div>
                <Link
                  href="/tournaments"
                  className="btn-secondary block w-full text-center sm:w-auto"
                >
                  Ver calendario de torneos
                </Link>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
                <p className="text-base font-medium text-slate-900">
                  No hay torneos próximos cargados.
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Cuando haya uno nuevo, va a quedar destacado acá.
                </p>
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
