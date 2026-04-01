export type Role = "player" | "admin";
export type BookingStatus = "confirmed" | "cancelled" | "completed";
export type ExternalTournamentPlatform = "rankedin" | "tournamentsoftware" | "otro";
export type LiveCourtId = "court-1" | "court-2";
export type ScheduleDayOverrideMode = "closed" | "custom_hours";

export interface BookingAvailabilitySettings {
  reservations_enabled: boolean;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface ScheduleDayOverride {
  slot_date: string;
  mode: ScheduleDayOverrideMode;
  opens_at: string | null;
  closes_at: string | null;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface LiveStreamConfig {
  title: string;
  description: string | null;
  banner_url: string | null;
  youtube_url: string;
  youtube_video_id: string;
  embed_url: string;
  squore_device_id: string | null;
  scoreboard_delay_seconds: number;
  is_live: boolean;
  starts_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminLiveStreamConfig extends LiveStreamConfig {
  tournament_software_post_url: string | null;
}

export interface LiveScoreboard {
  source: "squore";
  event_name: string | null;
  division_name: string | null;
  round_name: string | null;
  location: string | null;
  player_one_name: string;
  player_one_avatar_url?: string | null;
  player_two_name: string;
  player_two_avatar_url?: string | null;
  result: string | null;
  game_scores: string | null;
  winner_name: string | null;
  winner_side: 1 | 2 | null;
  duration_minutes: number | null;
  total_points_player_one: number | null;
  total_points_player_two: number | null;
  played_on: string | null;
  played_time: string | null;
  updated_at: string;
}

export interface LiveComment {
  id: string;
  court_id: LiveCourtId;
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
  body: string;
  created_at: string;
}

export interface LivePlayerMapping {
  id: string;
  squore_name: string;
  profile_id: string;
  profile_name: string | null;
  avatar_url?: string | null;
  updated_at: string;
  updated_by?: string | null;
}

export interface LiveIngestStatus {
  last_score_received_at: string | null;
  last_forwarded_at: string | null;
  last_forward_error: string | null;
  latest_payload_summary: string | null;
}

export interface LiveCourtState {
  id: LiveCourtId;
  label: string;
  stream: LiveStreamConfig | null;
  scoreboard: LiveScoreboard | null;
  comments?: LiveComment[];
}

export interface AdminLiveCourtState {
  id: LiveCourtId;
  label: string;
  stream: AdminLiveStreamConfig | null;
  scoreboard: LiveScoreboard | null;
  squore_post_url: string | null;
  overlay_url?: string | null;
  ingest_status?: LiveIngestStatus | null;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  category: string | null;
  avatar_url?: string | null;
  role: Role;
}

export interface PrivateMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrivateMessageGroup {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_general?: boolean;
  unread_count?: number;
  last_message_at?: string | null;
  last_message_id?: string | null;
  last_message_body?: string | null;
  last_message_sender_name?: string | null;
  members?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url">[];
}

export interface PrivateGroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
}

export interface CasualMatch {
  id: string;
  created_by: string;
  player_one_id: string;
  player_two_id: string;
  played_on: string;
  location: string | null;
  score_player_one: number;
  score_player_two: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  player_one?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
  player_two?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
  confirmation_status?: "pending" | "confirmed" | "revision_requested";
  confirmation_updated_at?: string | null;
  confirmation_note?: string | null;
  confirmation_updated_by?: string | null;
  needs_confirmation?: boolean;
}

export interface MatchAvailabilityRequest {
  id: string;
  user_id: string;
  available_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
}

export interface CasualMatchConfirmationState {
  status: "pending" | "confirmed" | "revision_requested";
  updated_at: string;
  updated_by: string | null;
  note: string | null;
}

export interface BookingWaitlistEntry {
  time_slot_id: string;
  user_id: string;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
}

export interface AdminAuditLog {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
}

export interface ExternalTournament {
  id: string;
  title: string;
  platform: ExternalTournamentPlatform;
  event_date: string | null;
  location: string | null;
  url: string;
  flyer_url?: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Court {
  id: string;
  name: string;
  is_active: boolean;
}

export interface TimeSlot {
  id: string;
  court_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  created_at: string;
}

export interface Booking {
  id: string;
  user_id: string;
  court_id: string;
  time_slot_id: string;
  status: BookingStatus;
  notes: string | null;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "category" | "avatar_url"> | null;
  time_slots?: TimeSlot & { courts?: Court };
  courts?: Court;
}
