import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ingresar | Squash Reservas",
  description: "Acceso a tu cuenta de Squash Reservas",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
