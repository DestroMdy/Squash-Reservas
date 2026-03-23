export type Role = "player" | "admin";
export type BookingStatus = "confirmed" | "cancelled" | "completed";
export type ExternalTournamentPlatform = "rankedin" | "tournamentsoftware" | "otro";

export interface LiveStreamConfig {
  title: string;
  description: string | null;
  banner_url: string | null;
  youtube_url: string;
  youtube_video_id: string;
  embed_url: string;
  is_live: boolean;
  starts_at: string | null;
  updated_at: string;
  updated_by: string | null;
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
