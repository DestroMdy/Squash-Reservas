import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cambiar contraseña | Squash Reservas",
  description: "Actualizá tu contraseña desde el enlace enviado por email"
};

export default function ResetPasswordLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
