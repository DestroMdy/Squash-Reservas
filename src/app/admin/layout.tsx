import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin | Squash Reservas",
  description: "Panel de administración de reservas",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
