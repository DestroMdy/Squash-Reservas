export type Role = "player" | "admin";
export type BookingStatus = "confirmed" | "cancelled" | "completed";
export type ExternalTournamentPlatform = "rankedin" | "tournamentsoftware" | "otro";

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
