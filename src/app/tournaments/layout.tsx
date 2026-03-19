import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Torneos | Squash Reservas"
};

export default function TournamentsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
