"use client";

import Link from "next/link";
import { SectionTitle } from "@/components/SectionTitle";
import { clubHighlights, clubRules, squashRules } from "@/lib/club-content";

export default function ClubPage() {
  return (
    <div className="space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="La Martineta"
        subtitle="Información general del club, reglas de reserva y experiencias destacadas dentro de la app."
      />

      <section className="card rounded-2xl border-orange-300 bg-gradient-to-br from-orange-50 via-white to-white p-6">
        <p className="font-dodger text-xs uppercase tracking-[0.24em] text-orange-700">
          La Martineta
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          El club dentro de una sola app
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Reservas, torneos, vivos de ambas canchas, mensajes y partidos casuales.
          La idea es que el jugador resuelva lo importante desde el celular sin
          depender de mensajes dispersos ni planillas externas.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/schedule" className="btn-accent">
            Reservar ahora
          </Link>
          <Link href="/tournament-center" className="btn-secondary">
            Ver dashboard de torneo
          </Link>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Reglas del club
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Resumen rápido para que el jugador entienda cómo funciona la agenda.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {clubRules.map((rule) => (
            <article key={rule.title} className="card rounded-2xl p-5">
              <h3 className="text-lg font-semibold text-slate-950">{rule.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rule.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Reglamento practico del squash
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Guia rapida del deporte para que cualquier jugador entienda lo esencial sin leer el reglamento completo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {squashRules.map((rule) => (
            <article key={rule.title} className="card rounded-2xl p-5">
              <h3 className="text-lg font-semibold text-slate-950">{rule.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rule.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Experiencias destacadas
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Lo mejor de la app para jugadores, torneos y comunidad.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {clubHighlights.map((highlight) => (
            <article key={highlight.title} className="card rounded-2xl p-5">
              <h3 className="text-lg font-semibold text-slate-950">
                {highlight.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {highlight.description}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
