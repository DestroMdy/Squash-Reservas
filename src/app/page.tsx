import Link from "next/link";
import { SectionTitle } from "../components/SectionTitle";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Squash Reservas" className="h-12 w-auto" />
        <span className="text-xl font-bold text-slate-900">Squash Reservas</span>
      </div>

      <SectionTitle
        title="Reservá tu cancha de squash"
        subtitle="Elegí día, horario y gestioná tus turnos desde el celular."
      />

      <section className="card space-y-4 p-6">
        <p className="text-slate-700">
          Esta app te permite ver disponibilidad, reservar turnos, cancelar reservas
          y administrar canchas de squash.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link href="/schedule" className="btn-primary">
            Ver agenda
          </Link>
          <Link href="/login" className="btn-secondary">
            Ingresar / Registrarse
          </Link>
          <Link href="/my-bookings" className="btn-secondary">
            Mis reservas
          </Link>
          <Link href="/courts" className="btn-secondary">
            Canchas
          </Link>
          <Link href="/admin" className="btn-secondary">
            Admin
          </Link>
          <Link href="/profile" className="btn-secondary">
            Mi perfil
          </Link>
          <Link href="/players" className="btn-secondary">
            Jugadores
          </Link>
        </div>
      </section>
    </div>
  );
}