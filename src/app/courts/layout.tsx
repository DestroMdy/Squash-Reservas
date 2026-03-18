import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Canchas | Squash Reservas",
  description: "Información y disponibilidad de canchas",
};

export default function CourtsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
