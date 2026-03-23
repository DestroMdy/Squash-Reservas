"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminLiveCenterSection } from "@/components/AdminLiveCenterSection";
import { AvatarImage } from "@/components/AvatarImage";
import { SectionTitle } from "@/components/SectionTitle";
import { buildCsv } from "@/lib/csv";
import {
  createExternalTournament,
  deleteExternalTournament,
  deleteProfileAsAdmin,
  fetchAdminAuditLogs,
  fetchAdminExternalTournaments,
  fetchAllBookings,
  fetchAllCasualMatches,
  fetchBookingStats,
  fetchPlayers,
  fetchProfileRole,
  getSession,
  getUser,
  promoteProfileToAdmin,
  updateBookingAsAdmin,
  updateExternalTournament
} from "@/lib/supabase";
import type {
  AdminAuditLog,
  Booking,
  BookingStatus,
  CasualMatch,
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

type AdminSectionKey =
  | "report"
  | "live"
  | "tournaments"
  | "audit"
  | "players"
  | "bookings";

const statusOptions: BookingStatus[] = ["confirmed", "cancelled", "completed"];
const tournamentPlatforms: ExternalTournamentPlatform[] = [
  "rankedin",
  "tournamentsoftware",
  "otro"
];

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function AdminAccordionSection({
  title,
  description,
  count,
  open,
  onToggle,
  children
}: {
  title: string;
  description: string;
  count?: number | string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-lg font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {typeof count !== "undefined" ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {count}
            </span>
          ) : null}
          <span className="text-xl leading-none text-slate-400">{open ? "−" : "+"}</span>
        </div>
      </button>
      {open ? <div className="border-t border-slate-200 p-5">{children}</div> : null}
    </section>
  );
}

export default function AdminPage() {
  const tournamentEditorRef = useRef<HTMLDivElement | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; confirmed: number; cancelled: number } | null>(null);
  const [bookings, setBookings] = useState<BookingWithRelations[]>([]);
  const [players, setPlayers] = useState<Profile[]>([]);
  const [tournaments, setTournaments] = useState<ExternalTournament[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditEnabled, setAuditEnabled] = useState(true);
  const [bookingFilter, setBookingFilter] = useState("");
  const [auditTextFilter, setAuditTextFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditTargetFilter, setAuditTargetFilter] = useState("all");
  const [reportMonth, setReportMonth] = useState(getCurrentMonthKey());
  const [tournamentForm, setTournamentForm] = useState<TournamentFormState>(getEmptyTournamentForm());
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTournament, setSavingTournament] = useState(false);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [promotingProfileId, setPromotingProfileId] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<AdminSectionKey, boolean>>({
    report: true,
    live: false,
    tournaments: false,
    audit: false,
    players: false,
    bookings: false
  });

  const redirectToLogin = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.replace("/login?next=/admin");
    }
  }, []);

  const getAdminToken = useCallback(() => {
    const token = getSession()?.access_token;
    if (!token) throw new Error("Debes iniciar sesión.");
    return token;
  }, []);

  const loadAdminData = useCallback(async () => {
    const token = getSession()?.access_token;
    if (!token) return redirectToLogin();

    const user = await getUser(token);
    if (!user) return redirectToLogin();

    const currentRole = await fetchProfileRole(user.id, token);
    setRole(currentRole ?? null);
    if (currentRole !== "admin") {
      setError("No tienes permisos de administrador.");
      setLoading(false);
      return;
    }

    const [bookingStats, allBookings, allPlayers, externalTournaments, auditData] =
      await Promise.all([
        fetchBookingStats(token),
        fetchAllBookings(token),
        fetchPlayers(token),
        fetchAdminExternalTournaments(token),
        fetchAdminAuditLogs(token)
      ]);

    setStats(bookingStats);
    setBookings(allBookings ?? []);
    setPlayers(allPlayers ?? []);
    setTournaments(externalTournaments ?? []);
    setAuditLogs(auditData.logs ?? []);
    setAuditEnabled(auditData.enabled !== false);
    setError(null);
    setLoading(false);
  }, [redirectToLogin]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        await loadAdminData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el panel.");
        setLoading(false);
      }
    }

    void init();
  }, [loadAdminData]);

  const filteredBookings = useMemo(() => {
    const normalized = bookingFilter.trim().toLowerCase();
    if (!normalized) return bookings;

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
        .includes(normalized);
    });
  }, [bookingFilter, bookings]);

  const monthlyReport = useMemo(() => {
    const monthlyBookings = bookings.filter((booking) =>
      booking.time_slots?.slot_date?.startsWith(reportMonth)
    );
    const activeBookings = monthlyBookings.filter((booking) => booking.status !== "cancelled");

    const byCourt = activeBookings.reduce<Record<string, number>>((acc, booking) => {
      const courtName =
        booking.time_slots?.courts?.name || booking.courts?.name || "Cancha";
      acc[courtName] = (acc[courtName] || 0) + 1;
      return acc;
    }, {});

    const byHour = activeBookings.reduce<Record<string, number>>((acc, booking) => {
      const start = booking.time_slots?.start_time?.slice(0, 5) || "--:--";
      const end = booking.time_slots?.end_time?.slice(0, 5) || "--:--";
      const key = `${start} - ${end}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const byDay = activeBookings.reduce<Record<string, number>>((acc, booking) => {
      const key = booking.time_slots?.slot_date || "Sin fecha";
      acc[key] = (acc[key] || 0) + 1;
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
    return new Intl.DateTimeFormat("es-AR", {
      month: "long",
      year: "numeric"
    }).format(new Date(Number(year), Number(month) - 1, 1));
  }, [reportMonth]);

  const auditActionOptions = useMemo(
    () => Array.from(new Set(auditLogs.map((log) => log.action))).sort(),
    [auditLogs]
  );

  const auditTargetOptions = useMemo(
    () => Array.from(new Set(auditLogs.map((log) => log.target_type))).sort(),
    [auditLogs]
  );

  const filteredAuditLogs = useMemo(() => {
    const normalized = auditTextFilter.trim().toLowerCase();

    return auditLogs.filter((log) => {
      if (auditActionFilter !== "all" && log.action !== auditActionFilter) return false;
      if (auditTargetFilter !== "all" && log.target_type !== auditTargetFilter) return false;
      if (!normalized) return true;

      return [
        log.profiles?.full_name || "",
        log.action,
        log.target_type,
        log.target_id,
        JSON.stringify(log.details || {})
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [auditActionFilter, auditLogs, auditTargetFilter, auditTextFilter]);

  const downloadCsv = useCallback((filename: string, rows: Array<Record<string, unknown>>) => {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  function toggleSection(section: AdminSectionKey) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function resetTournamentForm() {
    setEditingTournamentId(null);
    setTournamentForm(getEmptyTournamentForm());
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
    setMessage(`Editando torneo: ${tournament.title}`);
    setTimeout(() => {
      tournamentEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

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
      const token = getAdminToken();
      if (!editState?.userId) throw new Error("Debes seleccionar un jugador.");

      setSaving(true);
      setMessage(null);
      setError(null);

      await updateBookingAsAdmin(bookingId, token, {
        user_id: editState.userId,
        status: editState.status,
        notes: editState.notes.trim() || null
      });

      await loadAdminData();
      setMessage("Reserva actualizada correctamente.");
      stopEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la reserva.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProfile(player: Profile) {
    if (
      !window.confirm(
        `Vas a borrar el perfil de ${player.full_name || "este usuario"}. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      setDeletingProfileId(player.id);
      setMessage(null);
      setError(null);
      await deleteProfileAsAdmin(player, getAdminToken());
      await loadAdminData();
      setMessage("Perfil eliminado correctamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el perfil.");
    } finally {
      setDeletingProfileId(null);
    }
  }

  async function handlePromoteProfile(player: Profile) {
    if (
      !window.confirm(
        `Vas a convertir a ${player.full_name || "este usuario"} en administrador.`
      )
    ) {
      return;
    }

    try {
      setPromotingProfileId(player.id);
      setMessage(null);
      setError(null);
      await promoteProfileToAdmin(player.id, getAdminToken());
      await loadAdminData();
      setMessage("Usuario promovido a administrador.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el rol.");
    } finally {
      setPromotingProfileId(null);
    }
  }

  async function handleTournamentSubmit() {
    try {
      setSavingTournament(true);
      setMessage(null);
      setError(null);

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
        await updateExternalTournament(editingTournamentId, getAdminToken(), payload);
        setMessage("Torneo externo actualizado.");
      } else {
        await createExternalTournament(getAdminToken(), payload);
        setMessage("Torneo externo creado.");
      }

      await loadAdminData();
      resetTournamentForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el torneo externo."
      );
    } finally {
      setSavingTournament(false);
    }
  }

  async function handleDeleteTournament(tournament: ExternalTournament) {
    if (!window.confirm(`Vas a borrar el torneo "${tournament.title}".`)) {
      return;
    }

    try {
      setDeletingTournamentId(tournament.id);
      setMessage(null);
      setError(null);
      await deleteExternalTournament(tournament.id, getAdminToken());
      await loadAdminData();
      setMessage("Torneo externo borrado.");
      if (editingTournamentId === tournament.id) resetTournamentForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo borrar el torneo externo."
      );
    } finally {
      setDeletingTournamentId(null);
    }
  }

  async function handleExportBookings() {
    try {
      setExportingKey("bookings");
      const monthlyBookings = bookings.filter((booking) =>
        booking.time_slots?.slot_date?.startsWith(reportMonth)
      );
      downloadCsv(
        `reservas-${reportMonth}.csv`,
        monthlyBookings.map((booking) => ({
          id: booking.id,
          fecha: booking.time_slots?.slot_date || "",
          hora_inicio: booking.time_slots?.start_time?.slice(0, 5) || "",
          hora_fin: booking.time_slots?.end_time?.slice(0, 5) || "",
          cancha: booking.time_slots?.courts?.name || booking.courts?.name || "",
          jugador: booking.profiles?.full_name || "",
          categoria: booking.profiles?.category || "",
          estado: booking.status,
          nota: booking.notes || ""
        }))
      );
      setMessage("CSV de reservas descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar reservas.");
    } finally {
      setExportingKey(null);
    }
  }

  async function handleExportPlayers() {
    try {
      setExportingKey("players");
      downloadCsv(
        "jugadores.csv",
        players.map((player) => ({
          id: player.id,
          nombre: player.full_name || "",
          categoria: player.category || "",
          telefono: player.phone || "",
          rol: player.role
        }))
      );
      setMessage("CSV de jugadores descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar jugadores.");
    } finally {
      setExportingKey(null);
    }
  }

  async function handleExportAudit() {
    try {
      setExportingKey("audit");
      downloadCsv(
        "auditoria-admin.csv",
        filteredAuditLogs.map((log) => ({
          id: log.id,
          fecha: new Date(log.created_at).toISOString(),
          admin: log.profiles?.full_name || "Admin",
          accion: log.action,
          recurso: log.target_type,
          recurso_id: log.target_id,
          detalle: JSON.stringify(log.details || {})
        }))
      );
      setMessage("CSV de auditoría descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar auditoría.");
    } finally {
      setExportingKey(null);
    }
  }

  async function handleExportCasualMatches() {
    try {
      setExportingKey("matches");
      const matches = (await fetchAllCasualMatches(getAdminToken())) as CasualMatch[];
      downloadCsv(
        "partidos-casuales.csv",
        matches.map((match) => ({
          id: match.id,
          fecha: match.played_on,
          jugador_uno: match.player_one?.full_name || "",
          jugador_dos: match.player_two?.full_name || "",
          score_uno: match.score_player_one,
          score_dos: match.score_player_two,
          confirmacion: match.confirmation_status || "confirmed",
          actualizo: match.confirmation_updated_by || "",
          nota_confirmacion: match.confirmation_note || "",
          nota_partido: match.notes || ""
        }))
      );
      setMessage("CSV de partidos casuales descargado.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo exportar partidos casuales."
      );
    } finally {
      setExportingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Panel administrador"
        subtitle="Resumen general y edición manual de reservas."
      />

      {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-600">Cargando panel...</p> : null}

      {!loading && !error && role === "admin" && stats ? (
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

      {!loading && !error && role === "admin" ? (
        <div className="space-y-4">
          <AdminAccordionSection
            title="Historial mensual de reservas"
            description="Resumen para cierre mensual y detección de horarios más usados."
            count={monthlyReport.total}
            open={openSections.report}
            onToggle={() => toggleSection("report")}
          >
            <div className="space-y-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleExportBookings}
                    disabled={exportingKey === "bookings"}
                  >
                    {exportingKey === "bookings" ? "Exportando reservas..." : "Exportar reservas CSV"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleExportCasualMatches}
                    disabled={exportingKey === "matches"}
                  >
                    {exportingKey === "matches" ? "Exportando partidos..." : "Exportar partidos casuales"}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Reservas del mes</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{monthlyReport.total}</p>
                  <p className="mt-1 text-xs text-slate-500">{reportMonthLabel}</p>
                </article>
                <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm text-emerald-700">Activas</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-900">{monthlyReport.active}</p>
                  <p className="mt-1 text-xs text-emerald-700">Confirmadas + completadas</p>
                </article>
                <article className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                  <p className="text-sm text-sky-700">Completadas</p>
                  <p className="mt-2 text-3xl font-bold text-sky-900">{monthlyReport.completed}</p>
                  <p className="mt-1 text-xs text-sky-700">Turnos ya jugados</p>
                </article>
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">Canceladas</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{monthlyReport.cancelled}</p>
                  <p className="mt-1 text-xs text-slate-500">Confirmadas actuales: {monthlyReport.confirmed}</p>
                </article>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                {[
                  { title: "Horarios más usados", description: "Ranking del mes según reservas activas.", data: monthlyReport.byHour },
                  { title: "Canchas más usadas", description: "Ranking por cantidad de reservas activas.", data: monthlyReport.byCourt },
                  { title: "Días con más movimiento", description: "Fechas con mayor cantidad de reservas activas.", data: monthlyReport.byDay }
                ].map((card) => (
                  <article key={card.title} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-base font-semibold text-slate-900">{card.title}</h3>
                    <p className="mb-3 text-sm text-slate-500">{card.description}</p>
                    {card.data.length ? (
                      <div className="space-y-3">
                        {card.data.slice(0, 5).map(([label, count]) => (
                          <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                            <span className="font-medium text-slate-800">{label}</span>
                            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">{count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No hay reservas para ese mes.</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </AdminAccordionSection>

          <AdminAccordionSection
            title="Transmisión en vivo"
            description="Configura el centro en vivo de Cancha 1 y Cancha 2 con YouTube, Squore y reenvío a Tournament Software."
            count="2 canchas"
            open={openSections.live}
            onToggle={() => toggleSection("live")}
          >
            <AdminLiveCenterSection />
          </AdminAccordionSection>

          <AdminAccordionSection
            title="Torneos externos"
            description="Carga y edita links manuales a torneos externos."
            count={tournaments.length}
            open={openSections.tournaments}
            onToggle={() => toggleSection("tournaments")}
          >
            <div className="space-y-4">
              <div className="flex justify-start">
                <a href="/tournaments" target="_blank" rel="noreferrer" className="btn-secondary whitespace-nowrap">
                  Ver página pública
                </a>
              </div>

              <div
                ref={tournamentEditorRef}
                className={`grid gap-4 rounded-2xl p-4 md:grid-cols-2 ${
                  editingTournamentId ? "border-2 border-orange-300 bg-orange-50/60" : "border border-slate-200 bg-slate-50"
                }`}
              >
                <div className="md:col-span-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {editingTournamentId ? "Editando torneo" : "Nuevo torneo"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {editingTournamentId ? "Modifica los datos y guarda los cambios." : "Carga un torneo nuevo para mostrarlo en la app."}
                    </p>
                  </div>
                  {editingTournamentId ? (
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                      Modo edición
                    </span>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Nombre del torneo</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={tournamentForm.title}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, title: event.target.value })}
                    placeholder="Ej: Torneo Apertura"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Plataforma</label>
                  <select
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={tournamentForm.platform}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, platform: event.target.value as ExternalTournamentPlatform })}
                  >
                    {tournamentPlatforms.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform === "rankedin" ? "Rankedin" : platform === "tournamentsoftware" ? "Tournament Software" : "Otro"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Fecha</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={tournamentForm.event_date}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, event_date: event.target.value })}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Lugar</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={tournamentForm.location}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, location: event.target.value })}
                    placeholder="Club / ciudad"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Link del torneo</label>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={tournamentForm.url}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, url: event.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Notas</label>
                  <textarea
                    className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={tournamentForm.notes}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, notes: event.target.value })}
                    placeholder="Opcional"
                  />
                </div>

                <label className="md:col-span-2 flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={tournamentForm.is_active}
                    onChange={(event) => setTournamentForm({ ...tournamentForm, is_active: event.target.checked })}
                  />
                  Mostrar en la página pública de torneos
                </label>

                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button type="button" className="btn-primary" onClick={handleTournamentSubmit} disabled={savingTournament}>
                    {savingTournament ? "Guardando..." : editingTournamentId ? "Guardar torneo" : "Crear torneo"}
                  </button>
                  {editingTournamentId ? (
                    <button type="button" className="btn-secondary" onClick={resetTournamentForm} disabled={savingTournament}>
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
                      className={`flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between ${
                        editingTournamentId === tournament.id ? "border-2 border-orange-300 bg-orange-50/40" : "border border-slate-200 bg-white"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-slate-900">{tournament.title}</p>
                        <p className="text-sm text-slate-600">
                          {tournament.platform === "rankedin" ? "Rankedin" : tournament.platform === "tournamentsoftware" ? "Tournament Software" : "Otro"}
                          {tournament.event_date ? ` · ${tournament.event_date}` : ""}
                          {tournament.location ? ` · ${tournament.location}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {tournament.is_active ? "Visible en público" : "Oculto"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <a href={tournament.url} target="_blank" rel="noreferrer" className="btn-secondary">
                          Abrir link
                        </a>
                        <button type="button" className="btn-secondary" onClick={() => startTournamentEdit(tournament)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleDeleteTournament(tournament)}
                          disabled={deletingTournamentId === tournament.id}
                        >
                          {deletingTournamentId === tournament.id ? "Borrando..." : "Borrar"}
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Todavía no hay torneos externos cargados.</p>
                )}
              </div>
            </div>
          </AdminAccordionSection>

          <AdminAccordionSection
            title="Auditoría admin"
            description="Historial reciente de acciones sensibles realizadas por administradores."
            count={filteredAuditLogs.length}
            open={openSections.audit}
            onToggle={() => toggleSection("audit")}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Auditoría admin</h2>
                  <p className="text-sm text-slate-500">
                    Filtra por acción, recurso o texto libre y exporta el resultado.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                  {filteredAuditLogs.length} visibles
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  placeholder="Buscar por admin, acción, recurso o detalle"
                  value={auditTextFilter}
                  onChange={(event) => setAuditTextFilter(event.target.value)}
                />
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={auditActionFilter}
                  onChange={(event) => setAuditActionFilter(event.target.value)}
                >
                  <option value="all">Todas las acciones</option>
                  {auditActionOptions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  value={auditTargetFilter}
                  onChange={(event) => setAuditTargetFilter(event.target.value)}
                >
                  <option value="all">Todos los recursos</option>
                  {auditTargetOptions.map((target) => (
                    <option key={target} value={target}>
                      {target}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary" onClick={handleExportAudit} disabled={exportingKey === "audit"}>
                  {exportingKey === "audit" ? "Exportando..." : "Exportar CSV"}
                </button>
              </div>

              {!auditEnabled ? (
                <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  La auditoría todavía no está habilitada en la base. Falta correr la migración `admin_audit_logs`.
                </p>
              ) : filteredAuditLogs.length ? (
                <div className="space-y-3">
                  {filteredAuditLogs.map((log) => (
                    <article key={log.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-medium text-slate-900">
                            {log.profiles?.full_name || "Admin"} · {log.action}
                          </p>
                          <p className="text-sm text-slate-500">
                            {new Date(log.created_at).toLocaleString("es-AR")}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wide text-slate-600">
                          {log.target_type} · {log.target_id}
                        </span>
                      </div>
                      {log.details ? (
                        <pre className="mt-3 overflow-x-auto rounded-2xl bg-slate-950 p-3 text-xs text-slate-100">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No hay acciones auditadas para mostrar con esos filtros.</p>
              )}
            </div>
          </AdminAccordionSection>

          <AdminAccordionSection
            title="Gestión de jugadores"
            description="Administra perfiles, permisos y exportes."
            count={players.length}
            open={openSections.players}
            onToggle={() => toggleSection("players")}
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Gestión de jugadores</h2>
                  <p className="text-sm text-slate-500">
                    Como admin puedes borrar perfiles de usuarios o promoverlos.
                  </p>
                </div>
                <button type="button" className="btn-secondary" onClick={handleExportPlayers} disabled={exportingKey === "players"}>
                  {exportingKey === "players" ? "Exportando..." : "Exportar jugadores"}
                </button>
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
                        <AvatarImage
                          src={player.avatar_url}
                          alt={player.full_name || "Jugador"}
                          size={56}
                          className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                        />
                        <div>
                          <p className="font-medium text-slate-900">{player.full_name || "Sin nombre"}</p>
                          <p className="text-sm text-slate-600">
                            {player.category || "Sin categoría"} · {player.phone || "Sin teléfono"}
                          </p>
                          <p className="text-xs uppercase tracking-wide text-slate-400">{player.role}</p>
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
            </div>
          </AdminAccordionSection>

          <AdminAccordionSection
            title="Reservas"
            description="Despliega este bloque solo cuando necesites buscar o editar turnos."
            count={filteredBookings.length}
            open={openSections.bookings}
            onToggle={() => toggleSection("bookings")}
          >
            <div className="space-y-4">
              <div className="max-w-xl">
                <label className="mb-2 block text-sm font-medium text-slate-700">Buscar reservas</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                  placeholder="Jugador, categoría, cancha, fecha o estado"
                  value={bookingFilter}
                  onChange={(event) => setBookingFilter(event.target.value)}
                />
              </div>

              {filteredBookings.length ? (
                filteredBookings.map((booking) => {
                  const playerName = booking.profiles?.full_name || "Sin nombre";
                  const playerCategory = booking.profiles?.category || "Sin categoría";
                  const courtName = booking.time_slots?.courts?.name || booking.courts?.name || "Cancha";
                  const slotDate = booking.time_slots?.slot_date || "Sin fecha";
                  const startTime = booking.time_slots?.start_time?.slice(0, 5) || "--:--";
                  const endTime = booking.time_slots?.end_time?.slice(0, 5) || "--:--";
                  const isEditing = editingId === booking.id && editState;

                  return (
                    <article key={booking.id} className="card p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <p className="text-lg font-semibold text-slate-900">{courtName}</p>
                          <p className="text-sm text-slate-600">
                            {slotDate} · {startTime} - {endTime}
                          </p>
                          <p className="text-sm text-slate-700">
                            Jugador: <span className="font-medium">{playerName}</span>
                          </p>
                          <p className="text-sm text-slate-700">
                            Categoría: <span className="font-medium">{playerCategory}</span>
                          </p>
                          <p className="text-sm text-slate-500">Estado: {booking.status}</p>
                          {booking.notes ? <p className="text-sm text-slate-500">Nota: {booking.notes}</p> : null}
                        </div>

                        <div className="flex gap-2">
                          {!isEditing ? (
                            <button type="button" className="btn-secondary" onClick={() => startEditing(booking)}>
                              Editar reserva
                            </button>
                          ) : (
                            <button type="button" className="btn-secondary" onClick={stopEditing} disabled={saving}>
                              Cerrar editor
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Jugador</label>
                            <select
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                              value={editState.userId}
                              onChange={(event) => setEditState({ ...editState, userId: event.target.value })}
                            >
                              {players.map((player) => (
                                <option key={player.id} value={player.id}>
                                  {player.full_name || "Sin nombre"} · {player.category || "Sin categoría"}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Estado</label>
                            <select
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                              value={editState.status}
                              onChange={(event) => setEditState({ ...editState, status: event.target.value as BookingStatus })}
                            >
                              {statusOptions.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">Nota interna</label>
                            <textarea
                              className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                              value={editState.notes}
                              onChange={(event) => setEditState({ ...editState, notes: event.target.value })}
                              placeholder="Opcional"
                            />
                          </div>

                          <div className="md:col-span-2 flex gap-2">
                            <button type="button" className="btn-primary" onClick={() => handleSave(booking.id)} disabled={saving}>
                              {saving ? "Guardando..." : "Guardar cambios"}
                            </button>
                            <button type="button" className="btn-secondary" onClick={stopEditing} disabled={saving}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-slate-600">No se encontraron reservas con ese filtro.</p>
              )}
            </div>
          </AdminAccordionSection>
        </div>
      ) : null}
    </div>
  );
}
