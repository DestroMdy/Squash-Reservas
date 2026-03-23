import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ingresar | Squash",
  description: "Acceso a tu cuenta de Squash",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
