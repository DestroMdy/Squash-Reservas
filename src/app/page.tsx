import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center">
      <section className="card w-full p-8 sm:p-10">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            La Martineta
          </p>
          <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
            Squash Reservas
          </h1>
          <p className="max-w-2xl text-base text-slate-600 sm:text-lg">
            Reserva canchas, revisa tus turnos y administra tu perfil desde el
            celular.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary text-center">
            Ingresar
          </Link>
          <Link href="/schedule" className="btn-secondary text-center">
            Ver agenda
          </Link>
          <Link href="/my-bookings" className="btn-secondary text-center">
            Mis reservas
          </Link>
        </div>
      </section>
    </div>
  );
}
