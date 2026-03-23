import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cambiar contrasena | Squash",
  description: "Actualiza tu contrasena desde el enlace enviado por email"
};

export default function ResetPasswordLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return children;
}
