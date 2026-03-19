import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mensajes | Squash Reservas"
};

export default function MessagesLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
