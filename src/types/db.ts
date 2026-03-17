export type Role = "player" | "admin";
export type BookingStatus = "confirmed" | "cancelled" | "completed";

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  category: string | null;
  role: Role;
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
  time_slots?: TimeSlot & { courts?: Court };
  courts?: Court;
}