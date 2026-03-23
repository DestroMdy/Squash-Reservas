import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Horarios | Squash",
  description: "Consulta la grilla de horarios disponibles",
};

export default function ScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
