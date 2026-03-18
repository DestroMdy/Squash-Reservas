import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mis Reservas | Squash Reservas",
  description: "Gestiona tus reservas actuales",
};

export default function MyBookingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
