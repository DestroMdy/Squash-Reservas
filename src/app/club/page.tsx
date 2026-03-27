"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { SectionTitle } from "@/components/SectionTitle";
import {
  clubHighlights,
  clubRules,
  squashBeginnerExercises,
  squashIntermediateExercises,
  squashRuleCuriosities,
  squashRules,
  squashTrainingSources,
  squashTrainingTips,
  squashWorldSources
} from "@/lib/club-content";

type CollapsibleCardSectionProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
  accent?: boolean;
};

function CollapsibleCardSection({
  eyebrow,
  title,
  description,
  children,
  defaultOpen = false,
  accent = false
}: CollapsibleCardSectionProps) {
  const wrapperClassName = accent
    ? "card group rounded-2xl border-orange-300 bg-gradient-to-br from-orange-50 via-white to-white p-0"
    : "card group rounded-2xl border-slate-200 p-0 open:border-orange-300 open:shadow-[0_18px_45px_rgba(15,23,42,0.08)]";

  const badgeClassName = accent
    ? "mt-1 inline-flex min-w-[92px] items-center justify-center rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700 transition group-open:bg-orange-100"
    : "mt-1 inline-flex min-w-[92px] items-center justify-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition group-open:border-orange-200 group-open:bg-orange-50 group-open:text-orange-700";

  const dividerClassName = accent ? "border-t border-orange-100" : "border-t border-slate-100";

  return (
    <details open={defaultOpen} className={wrapperClassName}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-2xl px-5 py-5 marker:hidden">
        <div>
          <p
            className={
              accent
                ? "text-xs font-semibold uppercase tracking-[0.22em] text-orange-700"
                : "text-xs font-semibold uppercase tracking-[0.22em] text-slate-500"
            }
          >
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {description}
          </p>
        </div>
        <span className={badgeClassName}>
          <span className="group-open:hidden">Ver</span>
          <span className="hidden group-open:inline">Ocultar</span>
        </span>
      </summary>
      <div className={`${dividerClassName} px-5 pb-5 pt-4`}>{children}</div>
    </details>
  );
}

export default function ClubPage() {
  return (
    <div className="space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="La Martineta"
        subtitle="Informacion general del club, reglas de reserva y experiencias destacadas dentro de la app."
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

      <CollapsibleCardSection
        eyebrow="Reglas del club"
        title="Como funciona la agenda"
        description="Resumen rapido para que el jugador entienda como funciona la agenda del club sin perderse entre pantallas largas."
        defaultOpen
      >
        <div className="grid gap-4 md:grid-cols-2">
          {clubRules.map((rule) => (
            <article key={rule.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{rule.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rule.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Reglamento practico"
        title="Lo esencial del squash"
        description="Guia rapida del deporte para que cualquier jugador entienda lo importante sin tener que leer todo el reglamento completo."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {squashRules.map((rule) => (
            <article key={rule.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{rule.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rule.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Curiosidades"
        title="Reglas poco conocidas"
        description="Detalles del juego que suelen generar dudas cuando uno empieza a jugar o mirar partidos."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {squashRuleCuriosities.map((rule) => (
            <article key={rule.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{rule.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rule.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Consejos"
        title="Como jugar mejor"
        description="Recomendaciones simples y utiles para mejorar tecnica, orden en cancha y toma de decisiones."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {squashTrainingTips.map((tip) => (
            <article key={tip.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{tip.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {tip.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Entrenamiento"
        title="Ejercicios para principiantes"
        description="Opciones simples para alguien que recien empieza y necesita ordenarse dentro de la cancha antes de acelerar."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {squashBeginnerExercises.map((exercise) => (
            <article key={exercise.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{exercise.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {exercise.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Entrenamiento"
        title="Ejercicios para intermedios"
        description="Trabajo mas exigente para mejorar piernas, velocidad y capacidad de sostener puntos largos con tecnica."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {squashIntermediateExercises.map((exercise) => (
            <article key={exercise.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">{exercise.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {exercise.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Referencias"
        title="Material para profundizar"
        description="Separamos el material en espanol del original de World Squash para que cada uno abra lo que mas le sirve."
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Material en espanol
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {squashTrainingSources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                {source.title}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Material original de World Squash
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {squashWorldSources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary"
              >
                {source.title}
              </a>
            ))}
          </div>
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="Reglamento completo"
        title="Quien quiera verlo en detalle tambien lo tiene disponible"
        description="Ademas del resumen practico, la app incluye acceso directo al reglamento completo del deporte en PDF."
        accent
      >
        <div className="mt-1 flex flex-wrap gap-3">
          <a
            href="/docs/reglamento-squash.pdf"
            target="_blank"
            rel="noreferrer"
            className="btn-accent"
          >
            Abrir reglamento completo
          </a>
          <a href="/docs/reglamento-squash.pdf" download className="btn-secondary">
            Descargar PDF
          </a>
        </div>
      </CollapsibleCardSection>

      <CollapsibleCardSection
        eyebrow="La Martineta"
        title="Experiencias destacadas"
        description="Lo mejor de la app para jugadores, torneos y comunidad."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {clubHighlights.map((highlight) => (
            <article key={highlight.title} className="rounded-2xl bg-slate-50 p-5">
              <h3 className="text-lg font-semibold text-slate-950">
                {highlight.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {highlight.description}
              </p>
            </article>
          ))}
        </div>
      </CollapsibleCardSection>
    </div>
  );
}
