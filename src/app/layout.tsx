import type { Metadata, Viewport } from "next";
import { AdminBookingNotifier } from "@/components/AdminBookingNotifier";
import { MessageNotifier } from "@/components/MessageNotifier";
import { Navbar } from "@/components/Navbar";
import { SessionGate } from "@/components/SessionGate";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Squash",
  title: "Squash",
  description: "App para reservar canchas de squash",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
    email: false,
    address: false
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon.png"]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Squash"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900">
        <SessionGate>
          <AdminBookingNotifier />
          <MessageNotifier />
          <Navbar />
          <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </SessionGate>
      </body>
    </html>
  );
}
