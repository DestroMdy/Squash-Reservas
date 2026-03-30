"use client";

import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { AdminLiveCenterSection } from "@/components/AdminLiveCenterSection";
import { AvatarImage } from "@/components/AvatarImage";
import { SectionTitle } from "@/components/SectionTitle";
import { getReservationsPausedMessage } from "@/lib/booking-availability";
import { buildCsv } from "@/lib/csv";
import {
  createExternalTournament,
  fetchAdminBookingAvailability,
  deleteAdminScheduleOverride,
  deletePlayerAvatarAsAdmin,
  deleteExternalTournament,
  deleteProfileAsAdmin,
  fetchAdminAuditLogs,
  fetchAdminExternalTournaments,
  fetchAdminScheduleOverrides,
  fetchAllBookings,
  fetchAllCasualMatches,
  fetchBookingStats,
  fetchPlayers,
  fetchProfileRole,
  getSession,
  getUser,
  promoteProfileToAdmin,
  saveAdminBookingAvailability,
  saveAdminScheduleOverride,
  updatePlayerProfileAsAdmin,
  updateBookingAsAdmin,
  updateExternalTournament,
  uploadPlayerAvatarAsAdmin
} from "@/lib/supabase";
import type {
  AdminAuditLog,
  Booking,
  BookingAvailabilitySettings,
  BookingStatus,
  CasualMatch,
  ExternalTournament,
  ExternalTournamentPlatform,
  Profile,
  ScheduleDayOverride
} from "@/types/db";

type BookingWithRelations = Booking & {
  profiles?: Pick<Profile, "id" | "full_name" | "category"> | null;
};

type EditState = {
  userId: string;
  status: BookingStatus;
  notes: string;
};

type PlayerEditState = {
  full_name: string;
  phone: string;
  category: string;
  avatar_url: string;
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

type ScheduleFormMode = "default" | "closed" | "custom_hours";

type AdminSectionKey =
  | "report"
  | "schedule"
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
const categoryOptions = [
  "Primera",
  "Segunda",
  "Tercera",
  "Cuarta",
  "Quinta",
  "Principiante"
];

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getTodayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().split("T")[0];
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
  const [bookingAvailability, setBookingAvailability] =
    useState<BookingAvailabilitySettings | null>(null);
  const [bookingAvailabilityStoreEnabled, setBookingAvailabilityStoreEnabled] =
    useState(true);
  const [reservationsEnabled, setReservationsEnabled] = useState(true);
  const [bookingAvailabilityNote, setBookingAvailabilityNote] = useState("");
  const [scheduleOverrides, setScheduleOverrides] = useState<ScheduleDayOverride[]>([]);
  const [scheduleOverridesEnabled, setScheduleOverridesEnabled] = useState(true);
  const [scheduleDate, setScheduleDate] = useState(getTodayLocalDate());
  const [scheduleMode, setScheduleMode] = useState<ScheduleFormMode>("default");
  const [scheduleOpensAt, setScheduleOpensAt] = useState("10:00");
  const [scheduleClosesAt, setScheduleClosesAt] = useState("22:00");
  const [scheduleNote, setScheduleNote] = useState("");
  const [tournamentForm, setTournamentForm] = useState<TournamentFormState>(getEmptyTournamentForm());
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerEditState, setPlayerEditState] = useState<PlayerEditState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);
  const [savingBookingAvailability, setSavingBookingAvailability] =
    useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingTournament, setSavingTournament] = useState(false);
  const [deletingScheduleDate, setDeletingScheduleDate] = useState<string | null>(null);
  const [deletingTournamentId, setDeletingTournamentId] = useState<string | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null);
  const [uploadingPlayerAvatarId, setUploadingPlayerAvatarId] = useState<string | null>(null);
  const [deletingPlayerAvatarId, setDeletingPlayerAvatarId] = useState<string | null>(null);
  const [promotingProfileId, setPromotingProfileId] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<AdminSectionKey, boolean>>({
    report: true,
    schedule: false,
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

    const [
      bookingStats,
      allBookings,
      allPlayers,
      externalTournaments,
      auditData,
      scheduleData,
      bookingAvailabilityData
    ] =
      await Promise.all([
        fetchBookingStats(token),
        fetchAllBookings(token),
        fetchPlayers(token),
        fetchAdminExternalTournaments(token),
        fetchAdminAuditLogs(token),
        fetchAdminScheduleOverrides(token),
        fetchAdminBookingAvailability(token)
      ]);

    setStats(bookingStats);
    setBookings(allBookings ?? []);
    setPlayers(allPlayers ?? []);
    setTournaments(externalTournaments ?? []);
    setAuditLogs(auditData.logs ?? []);
    setAuditEnabled(auditData.enabled !== false);
    setScheduleOverrides(scheduleData.overrides ?? []);
    setScheduleOverridesEnabled(scheduleData.unavailable !== true);
    setBookingAvailability(bookingAvailabilityData.settings ?? null);
    setBookingAvailabilityStoreEnabled(
      bookingAvailabilityData.unavailable !== true
    );
    setReservationsEnabled(
      bookingAvailabilityData.settings?.reservations_enabled !== false
    );
    setBookingAvailabilityNote(bookingAvailabilityData.settings?.note || "");
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

  const selectedScheduleOverride = useMemo(
    () => scheduleOverrides.find((override) => override.slot_date === scheduleDate) || null,
    [scheduleDate, scheduleOverrides]
  );

  useEffect(() => {
    if (!selectedScheduleOverride) {
      setScheduleMode("default");
      setScheduleOpensAt("10:00");
      setScheduleClosesAt("22:00");
      setScheduleNote("");
      return;
    }

    setScheduleMode(selectedScheduleOverride.mode);
    setScheduleOpensAt(selectedScheduleOverride.opens_at?.slice(0, 5) || "10:00");
    setScheduleClosesAt(selectedScheduleOverride.closes_at?.slice(0, 5) || "22:00");
    setScheduleNote(selectedScheduleOverride.note || "");
  }, [selectedScheduleOverride]);

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

  const scheduleDateBookings = useMemo(
    () =>
      bookings.filter((booking) => booking.time_slots?.slot_date === scheduleDate),
    [bookings, scheduleDate]
  );

  const scheduleDateConfirmedBookings = useMemo(
    () => scheduleDateBookings.filter((booking) => booking.status === "confirmed"),
    [scheduleDateBookings]
  );

  const scheduleDateOutsideOverrideCount = useMemo(() => {
    if (scheduleMode !== "custom_hours") {
      return 0;
    }

    const opensAt = `${scheduleOpensAt}:00`;
    const closesAt = `${scheduleClosesAt}:00`;

    return scheduleDateConfirmedBookings.filter((booking) => {
      const startTime = booking.time_slots?.start_time;
      const endTime = booking.time_slots?.end_time;

      if (!startTime || !endTime) {
        return false;
      }

      return (
        startTime.localeCompare(opensAt) < 0 || endTime.localeCompare(closesAt) > 0
      );
    }).length;
  }, [
    scheduleClosesAt,
    scheduleDateConfirmedBookings,
    scheduleMode,
    scheduleOpensAt
  ]);

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

  async function handleSaveBookingAvailability() {
    try {
      setSavingBookingAvailability(true);
      setMessage(null);
      setError(null);

      const result = await saveAdminBookingAvailability(getAdminToken(), {
        reservations_enabled: reservationsEnabled,
        note: bookingAvailabilityNote.trim() || null
      });

      setBookingAvailability(result.settings);
      setBookingAvailabilityStoreEnabled(result.unavailable !== true);
      setReservationsEnabled(result.settings?.reservations_enabled !== false);
      setBookingAvailabilityNote(result.settings?.note || "");
      setMessage(
        reservationsEnabled
          ? "Las reservas volvieron a quedar habilitadas."
          : "Las reservas quedaron pausadas temporalmente."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el estado global de reservas."
      );
    } finally {
      setSavingBookingAvailability(false);
    }
  }

  async function handleSaveScheduleOverride() {
    try {
      const token = getAdminToken();

      if (!scheduleDate) {
        throw new Error("Debes elegir una fecha.");
      }

      if (scheduleMode === "default") {
        throw new Error("Elige cerrado o horario especial para guardar una excepción.");
      }

      if (scheduleMode === "custom_hours") {
        if (!scheduleOpensAt || !scheduleClosesAt) {
          throw new Error("Debes indicar apertura y cierre.");
        }

        if (scheduleOpensAt >= scheduleClosesAt) {
          throw new Error("La hora de cierre debe ser posterior a la de apertura.");
        }
      }

      setSavingSchedule(true);
      setMessage(null);
      setError(null);

      const result = await saveAdminScheduleOverride(token, {
        slot_date: scheduleDate,
        mode: scheduleMode,
        opens_at: scheduleMode === "custom_hours" ? `${scheduleOpensAt}:00` : null,
        closes_at: scheduleMode === "custom_hours" ? `${scheduleClosesAt}:00` : null,
        note: scheduleNote.trim() || null
      });

      setScheduleOverrides(result.overrides);
      setScheduleOverridesEnabled(result.unavailable !== true);
      setMessage(
        scheduleMode === "closed"
          ? "Día cerrado guardado en la agenda."
          : "Horario especial guardado en la agenda."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la excepción de agenda."
      );
    } finally {
      setSavingSchedule(false);
    }
  }

  async function handleDeleteScheduleOverride(slotDate: string) {
    if (!window.confirm(`Vas a quitar la excepción de agenda del ${slotDate}.`)) {
      return;
    }

    try {
      setDeletingScheduleDate(slotDate);
      setMessage(null);
      setError(null);
      const result = await deleteAdminScheduleOverride(getAdminToken(), slotDate);
      setScheduleOverrides(result.overrides);
      setScheduleOverridesEnabled(result.unavailable !== true);
      setMessage("La agenda volvió al horario habitual para esa fecha.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo borrar la excepción de agenda."
      );
    } finally {
      setDeletingScheduleDate(null);
    }
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

  function startPlayerEditing(player: Profile) {
    setEditingPlayerId(player.id);
    setPlayerEditState({
      full_name: player.full_name || "",
      phone: player.phone || "",
      category: player.category || "",
      avatar_url: player.avatar_url || ""
    });
  }

  function stopPlayerEditing() {
    setEditingPlayerId(null);
    setPlayerEditState(null);
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

  async function handleSavePlayerProfile(playerId: string) {
    try {
      if (!playerEditState) {
        throw new Error("No hay cambios para guardar.");
      }

      setSavingPlayerId(playerId);
      setMessage(null);
      setError(null);

      await updatePlayerProfileAsAdmin(playerId, getAdminToken(), {
        full_name: playerEditState.full_name.trim() || null,
        phone: playerEditState.phone.trim() || null,
        category: playerEditState.category.trim() || null
      });
      await loadAdminData();
      setMessage("Perfil actualizado correctamente.");
      stopPlayerEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el perfil.");
    } finally {
      setSavingPlayerId(null);
    }
  }

  async function handlePlayerAvatarChange(
    player: Profile,
    event: ChangeEvent<HTMLInputElement>
  ) {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadingPlayerAvatarId(player.id);
      setMessage(null);
      setError(null);

      const result = await uploadPlayerAvatarAsAdmin(player.id, getAdminToken(), file);

      if (editingPlayerId === player.id && playerEditState) {
        setPlayerEditState({
          ...playerEditState,
          avatar_url: result.avatarUrl || ""
        });
      }

      await loadAdminData();
      setMessage("Foto de perfil actualizada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setUploadingPlayerAvatarId(null);
      event.target.value = "";
    }
  }

  async function handleDeletePlayerAvatar(player: Profile) {
    if (!window.confirm(`Vas a quitar la foto de ${player.full_name || "este jugador"}.`)) {
      return;
    }

    try {
      setDeletingPlayerAvatarId(player.id);
      setMessage(null);
      setError(null);
      await deletePlayerAvatarAsAdmin(player.id, getAdminToken());

      if (editingPlayerId === player.id && playerEditState) {
        setPlayerEditState({
          ...playerEditState,
          avatar_url: ""
        });
      }

      await loadAdminData();
      setMessage("Foto de perfil eliminada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la foto.");
    } finally {
      setDeletingPlayerAvatarId(null);
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
            title="Agenda por fecha"
            description="Pausa reservas en todo el club o define un horario especial para una fecha puntual."
            count={scheduleOverrides.length}
            open={openSections.schedule}
            onToggle={() => toggleSection("schedule")}
          >
            <div className="space-y-5">
              <div
                className={`space-y-4 rounded-2xl border p-4 ${
                  reservationsEnabled
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Estado global de reservas
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-slate-900">
                      {reservationsEnabled
                        ? "Las reservas están habilitadas"
                        : "Las reservas están pausadas"}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Sirve para lanzar la app, dejar que la gente se registre y recién después abrir la agenda.
                    </p>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      reservationsEnabled
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {reservationsEnabled ? "Habilitadas" : "Pausadas"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={reservationsEnabled ? "btn-primary" : "btn-secondary"}
                    onClick={() => setReservationsEnabled(true)}
                    disabled={!bookingAvailabilityStoreEnabled}
                  >
                    Habilitar reservas
                  </button>
                  <button
                    type="button"
                    className={!reservationsEnabled ? "btn-primary" : "btn-secondary"}
                    onClick={() => setReservationsEnabled(false)}
                    disabled={!bookingAvailabilityStoreEnabled}
                  >
                    Pausar reservas
                  </button>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Mensaje visible en la agenda mientras estén pausadas
                  </label>
                  <textarea
                    className="min-h-[88px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={bookingAvailabilityNote}
                    onChange={(event) => setBookingAvailabilityNote(event.target.value)}
                    placeholder="Ejemplo: Estamos terminando la puesta en marcha. Pronto vamos a habilitar las reservas."
                    disabled={!bookingAvailabilityStoreEnabled}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveBookingAvailability}
                    disabled={savingBookingAvailability || !bookingAvailabilityStoreEnabled}
                  >
                    {savingBookingAvailability ? "Guardando..." : "Guardar estado global"}
                  </button>
                </div>

                {!bookingAvailabilityStoreEnabled ? (
                  <p className="rounded-2xl border border-amber-300 bg-white/80 px-4 py-3 text-sm text-amber-900">
                    El switch global de reservas no está disponible porque falta KV.
                  </p>
                ) : !reservationsEnabled ? (
                  <p className="rounded-2xl border border-amber-300 bg-white/80 px-4 py-3 text-sm text-amber-950">
                    Vista previa pública: {getReservationsPausedMessage(bookingAvailabilityNote)}
                  </p>
                ) : (
                  <p className="rounded-2xl border border-emerald-300 bg-white/80 px-4 py-3 text-sm text-emerald-900">
                    La agenda sigue operativa y los usuarios pueden reservar normalmente.
                  </p>
                )}

                {bookingAvailability?.updated_at && bookingAvailability?.updated_by ? (
                  <p className="text-xs text-slate-500">
                    Última actualización:{" "}
                    {new Intl.DateTimeFormat("es-AR", {
                      dateStyle: "short",
                      timeStyle: "short"
                    }).format(new Date(bookingAvailability.updated_at))}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Fecha a modificar
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={scheduleDate}
                    onChange={(event) => setScheduleDate(event.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Tipo de excepción
                  </label>
                  <select
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={scheduleMode}
                    onChange={(event) => setScheduleMode(event.target.value as ScheduleFormMode)}
                  >
                    <option value="default">Horario habitual</option>
                    <option value="closed">Día cerrado</option>
                    <option value="custom_hours">Horario especial</option>
                  </select>
                </div>

                {scheduleMode === "custom_hours" ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Abre desde
                      </label>
                      <input
                        type="time"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        value={scheduleOpensAt}
                        onChange={(event) => setScheduleOpensAt(event.target.value)}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        Cierra a las
                      </label>
                      <input
                        type="time"
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                        value={scheduleClosesAt}
                        onChange={(event) => setScheduleClosesAt(event.target.value)}
                      />
                    </div>
                  </>
                ) : null}

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Nota visible en la agenda
                  </label>
                  <textarea
                    className="min-h-[96px] w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                    value={scheduleNote}
                    onChange={(event) => setScheduleNote(event.target.value)}
                    placeholder="Ejemplo: Cerrado por torneo interno o horario reducido por mantenimiento."
                  />
                </div>

                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveScheduleOverride}
                    disabled={savingSchedule || !scheduleOverridesEnabled}
                  >
                    {savingSchedule ? "Guardando..." : "Guardar excepción"}
                  </button>
                  {selectedScheduleOverride ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleDeleteScheduleOverride(scheduleDate)}
                      disabled={
                        deletingScheduleDate === scheduleDate || !scheduleOverridesEnabled
                      }
                    >
                      {deletingScheduleDate === scheduleDate
                        ? "Quitando..."
                        : "Volver a horario habitual"}
                    </button>
                  ) : null}
                </div>
              </div>

              {!scheduleOverridesEnabled ? (
                <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  La configuración de agenda por fecha no está disponible porque falta KV.
                </p>
              ) : null}

              {scheduleDateConfirmedBookings.length ? (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                  <p className="font-medium">
                    Ya hay {scheduleDateConfirmedBookings.length} reserva(s) confirmada(s)
                    para {scheduleDate}.
                  </p>
                  <p className="mt-1">
                    Si cambias el horario o cierras el día, esas reservas siguen existiendo.
                    Revísalas en el bloque de reservas si necesitas moverlas o cancelarlas.
                  </p>
                  {scheduleMode === "closed" ? (
                    <p className="mt-2 font-medium">
                      El día cerrado ocultará toda la agenda pública, pero no borra reservas
                      existentes.
                    </p>
                  ) : null}
                  {scheduleMode === "custom_hours" && scheduleDateOutsideOverrideCount ? (
                    <p className="mt-2 font-medium">
                      Hay {scheduleDateOutsideOverrideCount} reserva(s) confirmada(s) fuera del
                      horario especial elegido.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Próximas excepciones</h2>
                  <p className="text-sm text-slate-500">
                    Carga un día puntual cerrado o con horario especial.
                  </p>
                </div>

                {scheduleOverrides.length ? (
                  scheduleOverrides.map((override) => {
                    const isSelected = override.slot_date === scheduleDate;
                    const modeLabel =
                      override.mode === "closed"
                        ? "Día cerrado"
                        : `${override.opens_at?.slice(0, 5) || "--:--"} - ${override.closes_at?.slice(0, 5) || "--:--"}`;

                    return (
                      <article
                        key={override.slot_date}
                        className={`flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between ${
                          isSelected
                            ? "border-2 border-orange-300 bg-orange-50/60"
                            : "border border-slate-200 bg-white"
                        }`}
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {new Intl.DateTimeFormat("es-AR", {
                              weekday: "long",
                              day: "2-digit",
                              month: "2-digit"
                            }).format(new Date(`${override.slot_date}T12:00:00`))}
                          </p>
                          <p className="text-sm text-slate-600">{modeLabel}</p>
                          {override.note ? (
                            <p className="mt-1 text-sm text-slate-500">{override.note}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setScheduleDate(override.slot_date)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleDeleteScheduleOverride(override.slot_date)}
                            disabled={deletingScheduleDate === override.slot_date}
                          >
                            {deletingScheduleDate === override.slot_date
                              ? "Quitando..."
                              : "Quitar"}
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">
                    Todavía no hay días con horario especial o cierre manual.
                  </p>
                )}
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
                    Como admin puedes editar datos, gestionar fotos, borrar perfiles o promover usuarios.
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
                  const isEditingPlayer =
                    editingPlayerId === player.id && Boolean(playerEditState);
                  const isSavingPlayer = savingPlayerId === player.id;
                  const isUploadingAvatar = uploadingPlayerAvatarId === player.id;
                  const isDeletingAvatar = deletingPlayerAvatarId === player.id;
                  const previewAvatarUrl =
                    isEditingPlayer && playerEditState
                      ? playerEditState.avatar_url || player.avatar_url
                      : player.avatar_url;

                  return (
                    <article
                      key={player.id}
                      className={`rounded-xl border bg-white p-4 transition ${
                        isEditingPlayer
                          ? "border-orange-300 shadow-[0_12px_30px_rgba(251,146,60,0.12)]"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-3">
                        <AvatarImage
                          src={previewAvatarUrl}
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
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() =>
                              isEditingPlayer ? stopPlayerEditing() : startPlayerEditing(player)
                            }
                            disabled={
                              Boolean(savingPlayerId) ||
                              Boolean(uploadingPlayerAvatarId) ||
                              Boolean(deletingPlayerAvatarId)
                            }
                          >
                            {isEditingPlayer ? "Cerrar editor" : "Editar perfil"}
                          </button>
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
                      </div>

                      {isEditingPlayer && playerEditState ? (
                        <div className="mt-4 grid gap-4 rounded-2xl border border-orange-200 bg-orange-50/40 p-4 md:grid-cols-2">
                          <div className="md:col-span-2 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex items-center gap-3">
                              <AvatarImage
                                src={previewAvatarUrl}
                                alt={playerEditState.full_name || player.full_name || "Jugador"}
                                size={88}
                                className="h-20 w-20 rounded-full border border-slate-200 object-cover"
                              />
                              <div>
                                <p className="font-medium text-slate-900">
                                  {playerEditState.full_name || "Jugador sin nombre"}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {playerEditState.category || "Sin categoria"}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <label className="btn-secondary inline-flex cursor-pointer items-center justify-center">
                                {isUploadingAvatar ? "Subiendo..." : "Cambiar foto"}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={(event) =>
                                    void handlePlayerAvatarChange(player, event)
                                  }
                                  disabled={isUploadingAvatar || isDeletingAvatar}
                                />
                              </label>

                              {previewAvatarUrl ? (
                                <button
                                  type="button"
                                  className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => void handleDeletePlayerAvatar(player)}
                                  disabled={isUploadingAvatar || isDeletingAvatar}
                                >
                                  {isDeletingAvatar ? "Quitando..." : "Quitar foto"}
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                              Nombre y apellido
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                              value={playerEditState.full_name}
                              onChange={(event) =>
                                setPlayerEditState({
                                  ...playerEditState,
                                  full_name: event.target.value
                                })
                              }
                              placeholder="Nombre completo"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                              Telefono
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                              value={playerEditState.phone}
                              onChange={(event) =>
                                setPlayerEditState({
                                  ...playerEditState,
                                  phone: event.target.value
                                })
                              }
                              placeholder="Ej: 2804123456"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-slate-700">
                              Categoria
                            </label>
                            <select
                              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                              value={playerEditState.category}
                              onChange={(event) =>
                                setPlayerEditState({
                                  ...playerEditState,
                                  category: event.target.value
                                })
                              }
                            >
                              <option value="">Sin categoria</option>
                              {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="md:col-span-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => void handleSavePlayerProfile(player.id)}
                              disabled={
                                isSavingPlayer || isUploadingAvatar || isDeletingAvatar
                              }
                            >
                              {isSavingPlayer ? "Guardando..." : "Guardar perfil"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary"
                              onClick={stopPlayerEditing}
                              disabled={isSavingPlayer}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : null}
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
