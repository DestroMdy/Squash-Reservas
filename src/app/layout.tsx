import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Squash Reservas",
  description: "App para reservar canchas de squash"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900">
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}