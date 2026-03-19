"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionTitle } from "@/components/SectionTitle";
import {
  createExternalTournament,
  deleteProfileAsAdmin,
  deleteExternalTournament,
  fetchAdminExternalTournaments,
  fetchAllBookings,
  fetchBookingStats,
  fetchPlayers,
  fetchProfileRole,
  getSession,
  getUser,
  promoteProfileToAdmin,
  updateExternalTournament,
  updateBookingAsAdmin
} from "@/lib/supabase";
import {
  Booking,
  BookingStatus,
  ExternalTournament,
  ExternalTournamentPlatform,
  Profile
} from "@/types/db";

type BookingWithRelations = Booking & {
  profiles?: Pick<Profile, "id" | "full_name" | "category"> | null;
};

type EditState = {
  userId: string;
  status: BookingStatus;
  notes: string;
};

type TournamentFormState = {
  title: string;
  platform: ExternalTournamentPlatform;
  event_date: string;
  location: string;
  url: string;
  notes: string;
  is_active: boolean;
};

const statusOptions: BookingStatus[] = ["confirmed", "cancelled", "completed"];
const tournamentPlatforms: ExternalTournamentPlatform[] = [
  "rankedin",
  "tournamentsoftware",
  "otro"
];

function getCurrentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function getEmptyTournamentForm(): TournamentFormState {
  return {
    title: "",
    platform: "rankedin",
    event_date: "",
    location: "",
    url: "",
    notes: "",
    is_active: true
  };
}

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    confirmed: number;
    cancelled: number;
  } | null>(null);
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [tournaments, setTournaments] = useState<ExternalTournament[]>([]);
  const [filter, setFilter] = useState("");
  const [reportMonth, setReportMonth] = useState(getCurrentMonthKey());
  const [tournamentForm, setTournamentForm] = useState<TournamentFormState>(
    getEmptyTournamentForm()
  );
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTournament, setSavingTournament] = useState(false);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [promotingProfileId, setPromotingProfileId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAdminData() {
    const token = getSession()?.access_token;
    if (!token) {
      setError("Debes iniciar sesión");
      setLoading(false);
      return;
    }

    const user = await getUser(token);
    if (!user) {
      setError("Sesión inválida");
      setLoading(false);
      return;
    }

    const currentRole = await fetchProfileRole(user.id, token);
    setRole(currentRole ?? null);

    if (currentRole !== "admin") {
      setError("No tienes permisos de administrador");
      setLoading(false);
      return;
    }

    const [bookingStats, allBookings, allPlayers, externalTournaments] = await Promise.all([
      fetchBookingStats(token),
      fetchAllBookings(token),
      fetchPlayers(token),
      fetchAdminExternalTournaments(token)
    ]);

    setStats(bookingStats);
    setBookings(allBookings ?? []);
    setPlayers(allPlayers ?? []);
    setTournaments(externalTournaments ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        await loadAdminData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el panel");
        setLoading(false);
      }
    }

    init();
  }, []);

  const filteredBookings = useMemo(() => {
    const normalizedFilter = filter.trim().toLowerCase();

    if (!normalizedFilter) {
      return bookings;
    }

    return bookings.filter((booking) => {
      const playerName = booking.profiles?.full_name || "";
      const playerCategory = booking.profiles?.category || "";
      const courtName =
        booking.time_slots?.courts?.name || booking.courts?.name || "";
      const slotDate = booking.time_slots?.slot_date || "";
      const slotTime = booking.time_slots?.start_time?.slice(0, 5) || "";

      return [
        playerName,
        playerCategory,
        courtName,
        slotDate,
        slotTime,
        booking.status
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedFilter);
    });
  }, [bookings, filter]);

  const monthlyReport = useMemo(() => {
    const monthlyBookings = bookings.filter((booking) =>
      booking.time_slots?.slot_date?.startsWith(reportMonth)
    );

    const activeBookings = monthlyBookings.filter(
      (booking) => booking.status !== "cancelled"
    );

    const byCourt = activeBookings.reduce<Record<string, number>>((acc, booking) => {
      const courtName =
        booking.time_slots?.courts?.name || booking.courts?.name || "Cancha sin nombre";
      acc[courtName] = (acc[courtName] || 0) + 1;
      return acc;
    }, {});

    const byHour = activeBookings.reduce<Record<string, number>>((acc, booking) => {
      const startTime = booking.time_slots?.start_time?.slice(0, 5) || "--:--";
      const endTime = booking.time_slots?.end_time?.slice(0, 5) || "--:--";
      const key = `${startTime} - ${endTime}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byDay = activeBookings.reduce<Record<string, number>>((acc, booking) => {
      const dayKey = booking.time_slots?.slot_date || "Sin fecha";
      acc[dayKey] = (acc[dayKey] || 0) + 1;
      return acc;
    }, {});

    return {
      total: monthlyBookings.length,
      confirmed: monthlyBookings.filter((booking) => booking.status === "confirmed").length,
      completed: monthlyBookings.filter((booking) => booking.status === "completed").length,
      cancelled: monthlyBookings.filter((booking) => booking.status === "cancelled").length,
      active: activeBookings.length,
      byCourt: Object.entries(byCourt).sort((a, b) => b[1] - a[1]),
      byHour: Object.entries(byHour).sort((a, b) => b[1] - a[1]),
      byDay: Object.entries(byDay).sort((a, b) => b[1] - a[1])
    };
  }, [bookings, reportMonth]);

  const reportMonthLabel = useMemo(() => {
    const [year, month] = reportMonth.split("-");
    const date = new Date(Number(year), Number(month) - 1, 1);
    return new Intl.DateTimeFormat("es-AR", {
      month: "long",
      year: "numeric"
    }).format(date);
  }, [reportMonth]);

  function startEditing(booking: BookingWithRelations) {
    setEditingId(booking.id);
    setEditState({
      userId: booking.user_id,
      status: booking.status,
      notes: booking.notes || ""
    });
    setMessage(null);
  }

  function stopEditing() {
    setEditingId(null);
    setEditState(null);
  }

  async function handleSave(bookingId: string) {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      if (!editState?.userId) {
        throw new Error("Debes seleccionar un jugador");
      }

      setSaving(true);
      setMessage(null);

      await updateBookingAsAdmin(bookingId, token, {
        user_id: editState.userId,
        status: editState.status,
        notes: editState.notes.trim() || null
      });

      await loadAdminData();
      setMessage("Reserva actualizada correctamente.");
      stopEditing();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "No se pudo actualizar la reserva"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProfile(player: Profile) {
    const confirmed = window.confirm(
      `Vas a borrar el perfil de ${player.full_name || "este usuario"}. Esta acción no se puede deshacer.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setDeletingProfileId(player.id);
      setMessage(null);
      setError(null);

      await deleteProfileAsAdmin(player, token);
      await loadAdminData();
      setMessage("Perfil eliminado correctamente.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "No se pudo eliminar el perfil"
      );
    } finally {
      setDeletingProfileId(null);
    }
  }

  async function handlePromoteProfile(player: Profile) {
    const confirmed = window.confirm(
      `Vas a convertir a ${player.full_name || "este usuario"} en administrador.`
    );

    if (!confirmed) {
      return;
    }

    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setPromotingProfileId(player.id);
      setMessage(null);
      setError(null);

      await promoteProfileToAdmin(player.id, token);
      await loadAdminData();
      setMessage("Usuario promovido a administrador.");
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "No se pudo actualizar el rol"
      );
    } finally {
      setPromotingProfileId(null);
    }
  }

  function startTournamentEdit(tournament: ExternalTournament) {
    setEditingTournamentId(tournament.id);
    setTournamentForm({
      title: tournament.title,
      platform: tournament.platform,
      event_date: tournament.event_date || "",
      location: tournament.location || "",
      url: tournament.url,
      notes: tournament.notes || "",
      is_active: tournament.is_active
    });
    setMessage(null);
  }

  function resetTournamentForm() {
    setEditingTournamentId(null);
    setTournamentForm(getEmptyTournamentForm());
  }

  async function handleTournamentSubmit() {
    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setSavingTournament(true);
      setMessage(null);

      const payload = {
        title: tournamentForm.title,
        platform: tournamentForm.platform,
        event_date: tournamentForm.event_date || null,
        location: tournamentForm.location || null,
        url: tournamentForm.url,
        notes: tournamentForm.notes || null,
        is_active: tournamentForm.is_active
      };

      if (editingTournamentId) {
        await updateExternalTournament(editingTournamentId, token, payload);
        setMessage("Torneo externo actualizado.");
      } else {
        await createExternalTournament(token, payload);
        setMessage("Torneo externo creado.");
      }

      await loadAdminData();
      resetTournamentForm();
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "No se pudo guardar el torneo externo"
      );
    } finally {
      setSavingTournament(false);
    }
  }

  async function handleDeleteTournament(tournament: ExternalTournament) {
    const confirmed = window.confirm(
      `Vas a borrar el torneo "${tournament.title}".`
    );

    if (!confirmed) {
      return;
    }

    try {
      const token = getSession()?.access_token;
      if (!token) {
        throw new Error("Debes iniciar sesión");
      }

      setDeletingTournamentId(tournament.id);
      setMessage(null);
      await deleteExternalTournament(tournament.id, token);
      await loadAdminData();
      setMessage("Torneo externo borrado.");
      if (editingTournamentId === tournament.id) {
        resetTournamentForm();
      }
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "No se pudo borrar el torneo externo"
      );
    } finally {
      setDeletingTournamentId(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Panel administrador"
        subtitle="Resumen general y edición manual de reservas."
      />

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {error ? <p className="text-red-600">{error}</p> : null}

      {!error && role === "admin" && stats ? (
        <div className="grid gap-4 md:grid-cols-3">
          <article className="card p-4">
            <p className="text-sm text-slate-500">Reservas totales</p>
            <p className="mt-2 text-3xl font-bold">{stats.total}</p>
          </article>

          <article className="card p-4">
            <p className="text-sm text-slate-500">Confirmadas</p>
            <p className="mt-2 text-3xl font-bold">{stats.confirmed}</p>
          </article>

          <article className="card p-4">
            <p className="text-sm text-slate-500">Canceladas</p>
            <p className="mt-2 text-3xl font-bold">{stats.cancelled}</p>
          </article>
        </div>
      ) : null}

      {!error && role === "admin" ? (
        <section className="card space-y-5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Historial mensual de reservas
              </h2>
              <p className="text-sm text-slate-500">
                Resumen para cierre mensual y deteccion de horarios mas usados.
              </p>
            </div>

            <div className="w-full md:w-56">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Mes del reporte
              </label>
              <input
                type="month"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={reportMonth}
                onChange={(event) => setReportMonth(event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Reservas del mes</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {monthlyReport.total}
              </p>
              <p className="mt-1 text-xs text-slate-500">{reportMonthLabel}</p>
            </article>

            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Activas</p>
              <p className="mt-2 text-3xl font-bold text-emerald-900">
                {monthlyReport.active}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                Confirmadas + completadas
              </p>
            </article>

            <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm text-sky-700">Completadas</p>
              <p className="mt-2 text-3xl font-bold text-sky-900">
                {monthlyReport.completed}
              </p>
              <p className="mt-1 text-xs text-sky-700">
                Turnos ya jugados
              </p>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">Canceladas</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {monthlyReport.cancelled}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Confirmadas actuales: {monthlyReport.confirmed}
              </p>
            </article>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Horarios mas usados
              </h3>
              <p className="mb-3 text-sm text-slate-500">
                Ranking del mes segun reservas activas.
              </p>

              {monthlyReport.byHour.length ? (
                <div className="space-y-3">
                  {monthlyReport.byHour.slice(0, 5).map(([label, count]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No hay reservas para ese mes.
                </p>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Canchas mas usadas
              </h3>
              <p className="mb-3 text-sm text-slate-500">
                Ranking por cantidad de reservas activas.
              </p>

              {monthlyReport.byCourt.length ? (
                <div className="space-y-3">
                  {monthlyReport.byCourt.slice(0, 5).map(([label, count]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No hay reservas para ese mes.
                </p>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Dias con mas movimiento
              </h3>
              <p className="mb-3 text-sm text-slate-500">
                Fechas con mayor cantidad de reservas activas.
              </p>

              {monthlyReport.byDay.length ? (
                <div className="space-y-3">
                  {monthlyReport.byDay.slice(0, 5).map(([label, count]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                    >
                      <span className="font-medium text-slate-800">{label}</span>
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No hay reservas para ese mes.
                </p>
              )}
            </article>
          </div>
        </section>
      ) : null}

      {!error && role === "admin" ? (
        <section className="card space-y-5 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Torneos externos
              </h2>
              <p className="text-sm text-slate-500">
                Carga links manuales a torneos de Rankedin, Tournament Software u otras plataformas.
              </p>
            </div>
            <a
              href="/tournaments"
              target="_blank"
              rel="noreferrer"
              className="btn-secondary whitespace-nowrap"
            >
              Ver página pública
            </a>
          </div>

          <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Nombre del torneo
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={tournamentForm.title}
                onChange={(event) =>
                  setTournamentForm({ ...tournamentForm, title: event.target.value })
                }
                placeholder="Ej: Torneo Apertura"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Plataforma
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={tournamentForm.platform}
                onChange={(event) =>
                  setTournamentForm({
                    ...tournamentForm,
                    platform: event.target.value as ExternalTournamentPlatform
                  })
                }
              >
                {tournamentPlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform === "rankedin"
                      ? "Rankedin"
                      : platform === "tournamentsoftware"
                        ? "Tournament Software"
                        : "Otro"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Fecha
              </label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={tournamentForm.event_date}
                onChange={(event) =>
                  setTournamentForm({
                    ...tournamentForm,
                    event_date: event.target.value
                  })
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Lugar
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={tournamentForm.location}
                onChange={(event) =>
                  setTournamentForm({
                    ...tournamentForm,
                    location: event.target.value
                  })
                }
                placeholder="Club / ciudad"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Link del torneo
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={tournamentForm.url}
                onChange={(event) =>
                  setTournamentForm({ ...tournamentForm, url: event.target.value })
                }
                placeholder="https://..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Notas
              </label>
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={tournamentForm.notes}
                onChange={(event) =>
                  setTournamentForm({ ...tournamentForm, notes: event.target.value })
                }
                placeholder="Opcional"
              />
            </div>

            <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={tournamentForm.is_active}
                onChange={(event) =>
                  setTournamentForm({
                    ...tournamentForm,
                    is_active: event.target.checked
                  })
                }
              />
              Mostrar en la página pública de torneos
            </label>

            <div className="md:col-span-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={handleTournamentSubmit}
                disabled={savingTournament}
              >
                {savingTournament
                  ? "Guardando..."
                  : editingTournamentId
                    ? "Guardar torneo"
                    : "Crear torneo"}
              </button>
              {editingTournamentId ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetTournamentForm}
                  disabled={savingTournament}
                >
                  Cancelar edición
                </button>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {tournaments.length ? (
              tournaments.map((tournament) => (
                <article
                  key={tournament.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-slate-900">{tournament.title}</p>
                    <p className="text-sm text-slate-600">
                      {(tournament.platform === "rankedin"
                        ? "Rankedin"
                        : tournament.platform === "tournamentsoftware"
                          ? "Tournament Software"
                          : "Otro")}
                      {tournament.event_date ? ` · ${tournament.event_date}` : ""}
                      {tournament.location ? ` · ${tournament.location}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {tournament.is_active ? "Visible en público" : "Oculto"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={tournament.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      Abrir link
                    </a>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => startTournamentEdit(tournament)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleDeleteTournament(tournament)}
                      disabled={deletingTournamentId === tournament.id}
                    >
                      {deletingTournamentId === tournament.id
                        ? "Borrando..."
                        : "Borrar"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Todavía no hay torneos externos cargados.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {!error && role === "admin" ? (
        <section className="card p-4">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Buscar reservas
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            placeholder="Jugador, categoría, cancha, fecha o estado"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </section>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Cargando panel...</p> : null}

      {!loading && !error && role === "admin" ? (
        <div className="space-y-4">
          <section className="card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Gestión de jugadores
                </h2>
                <p className="text-sm text-slate-500">
                  Como admin puedes borrar perfiles de usuarios.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                {players.length}
              </span>
            </div>

            <div className="space-y-3">
              {players.map((player) => {
                const isCurrentAdmin = player.role === "admin";
                const isDeleting = deletingProfileId === player.id;
                const isPromoting = promotingProfileId === player.id;

                return (
                  <article
                    key={player.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={player.avatar_url || "/icon-192.png"}
                        alt={player.full_name || "Jugador"}
                        className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                      />
                      <div>
                        <p className="font-medium text-slate-900">
                          {player.full_name || "Sin nombre"}
                        </p>
                        <p className="text-sm text-slate-600">
                          {player.category || "Sin categoría"} · {player.phone || "Sin teléfono"}
                        </p>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          {player.role}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {isCurrentAdmin ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                          Admin protegido
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-xl border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handlePromoteProfile(player)}
                            disabled={Boolean(promotingProfileId) || Boolean(deletingProfileId)}
                          >
                            {isPromoting ? "Promoviendo..." : "Hacer admin"}
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleDeleteProfile(player)}
                            disabled={Boolean(deletingProfileId) || Boolean(promotingProfileId)}
                          >
                            {isDeleting ? "Eliminando..." : "Borrar perfil"}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {filteredBookings.map((booking) => {
            const playerName = booking.profiles?.full_name || "Sin nombre";
            const playerCategory =
              booking.profiles?.category || "Sin categoría";
            const courtName =
              booking.time_slots?.courts?.name || booking.courts?.name || "Cancha";
            const slotDate = booking.time_slots?.slot_date || "Sin fecha";
            const startTime = booking.time_slots?.start_time?.slice(0, 5) || "--:--";
            const endTime = booking.time_slots?.end_time?.slice(0, 5) || "--:--";
            const isEditing = editingId === booking.id && editState;

            return (
              <article key={booking.id} className="card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold text-slate-900">
                      {courtName}
                    </p>
                    <p className="text-sm text-slate-600">
                      {slotDate} · {startTime} - {endTime}
                    </p>
                    <p className="text-sm text-slate-700">
                      Jugador: <span className="font-medium">{playerName}</span>
                    </p>
                    <p className="text-sm text-slate-700">
                      Categoría:{" "}
                      <span className="font-medium">{playerCategory}</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      Estado: {booking.status}
                    </p>
                    {booking.notes ? (
                      <p className="text-sm text-slate-500">
                        Nota: {booking.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    {!isEditing ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => startEditing(booking)}
                      >
                        Editar reserva
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={stopEditing}
                        disabled={saving}
                      >
                        Cerrar editor
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Jugador
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        value={editState.userId}
                        onChange={(event) =>
                          setEditState({
                            ...editState,
                            userId: event.target.value
                          })
                        }
                      >
                        {players.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.full_name || "Sin nombre"} ·{" "}
                            {player.category || "Sin categoría"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Estado
                      </label>
                      <select
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        value={editState.status}
                        onChange={(event) =>
                          setEditState({
                            ...editState,
                            status: event.target.value as BookingStatus
                          })
                        }
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Nota interna
                      </label>
                      <textarea
                        className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        value={editState.notes}
                        onChange={(event) =>
                          setEditState({
                            ...editState,
                            notes: event.target.value
                          })
                        }
                        placeholder="Opcional"
                      />
                    </div>

                    <div className="md:col-span-2 flex gap-2">
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handleSave(booking.id)}
                        disabled={saving}
                      >
                        {saving ? "Guardando..." : "Guardar cambios"}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={stopEditing}
                        disabled={saving}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}

          {!filteredBookings.length ? (
            <p className="text-sm text-slate-600">
              No se encontraron reservas con ese filtro.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
