import Link from "next/link";
import { SectionTitle } from "@/components/SectionTitle";
import {
  patagonianCircuitLabels,
  patagonianRankingCategories,
  patagonianRankingSummary,
  patagonianRankingUpdatedLabel,
  patagonianScoringSystem,
  type PatagonianCircuitKey,
  type PatagonianRankingCategory
} from "@/lib/patagonian-ranking";

const circuitKeys = Object.keys(patagonianCircuitLabels) as PatagonianCircuitKey[];

function formatPoints(value?: number) {
  if (typeof value !== "number") {
    return "-";
  }

  return Number.isInteger(value) ? `${value}` : `${value}`;
}

function RankingCategorySection({
  category,
  defaultOpen = false
}: {
  category: PatagonianRankingCategory;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={category.id}
      open={defaultOpen}
      className="card group rounded-2xl border-slate-200 p-0 open:border-orange-300 open:shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-2xl px-5 py-5 marker:hidden">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {category.subtitle}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            {category.title}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {category.entries.length
              ? `${category.entries.length} jugadores rankeados en esta categoria.`
              : "Todavia no hay jugadores rankeados en esta categoria."}
          </p>
        </div>
        <span className="mt-1 inline-flex min-w-[96px] items-center justify-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition group-open:border-orange-200 group-open:bg-orange-50 group-open:text-orange-700">
          <span className="group-open:hidden">Ver</span>
          <span className="hidden group-open:inline">Ocultar</span>
        </span>
      </summary>

      <div className="border-t border-slate-100 px-5 pb-5 pt-4">
        {category.entries.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <th className="px-3 py-2">Puesto</th>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Localidad</th>
                    {circuitKeys.map((key) => (
                      <th key={key} className="px-3 py-2 text-center">
                        {patagonianCircuitLabels[key]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {category.entries.map((entry) => (
                    <tr
                      key={`${category.id}-${entry.playerName}`}
                      className="rounded-2xl bg-slate-50 text-sm text-slate-700"
                    >
                      <td className="rounded-l-2xl px-3 py-3 font-semibold text-slate-950">
                        {entry.position}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-950">
                        {entry.playerName}
                      </td>
                      <td className="px-3 py-3">{entry.city}</td>
                      {circuitKeys.map((key) => (
                        <td key={key} className="px-3 py-3 text-center">
                          {formatPoints(entry.scores[key])}
                        </td>
                      ))}
                      <td className="rounded-r-2xl px-3 py-3 text-right font-semibold text-orange-700">
                        {formatPoints(entry.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {category.entries.map((entry) => (
                <article
                  key={`${category.id}-${entry.playerName}-mobile`}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Puesto {entry.position}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-slate-950">
                        {entry.playerName}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">{entry.city}</p>
                    </div>
                    <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">
                      {formatPoints(entry.total)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {circuitKeys.map((key) => (
                      <div key={key} className="rounded-xl bg-slate-50 px-2 py-2 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {patagonianCircuitLabels[key]}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {formatPoints(entry.scores[key])}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            No hay ranking cargado todavia para esta categoria.
          </div>
        )}
      </div>
    </details>
  );
}

export default function RankingPatagonicoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/" className="btn-secondary">
        Volver al inicio
      </Link>

      <SectionTitle
        title="Ranking Patagonico"
        subtitle="Ranking actual del Circuito Patagonico de Squash, separado por categoria y con el detalle de puntaje acumulado."
      />

      <section className="card rounded-2xl border-orange-300 bg-gradient-to-br from-orange-50 via-white to-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-dodger text-xs uppercase tracking-[0.24em] text-orange-700">
              Circuito Patagonico
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
              Ranking actualizado {patagonianRankingUpdatedLabel}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Cargamos el ranking actual segun la planilla compartida del circuito para
              que cualquier jugador pueda consultarlo rapido desde la app.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_35px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Categorias
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {patagonianRankingSummary.categoryCount}
              </p>
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_16px_35px_rgba(15,23,42,0.06)]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Jugadores rankeados
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {patagonianRankingSummary.playerCount}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {patagonianRankingCategories.map((category) => (
            <a
              key={`${category.id}-shortcut`}
              href={`#${category.id}`}
              className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-400 hover:text-slate-950"
            >
              {category.title}
            </a>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {patagonianRankingCategories.map((category, index) => (
            <RankingCategorySection
              key={category.id}
              category={category}
              defaultOpen={index === 0}
            />
          ))}
        </div>

        <aside className="space-y-6">
          <section className="card rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Sistema de puntaje
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Como suma cada instancia
            </h2>
            <div className="mt-4 space-y-3">
              {patagonianScoringSystem.map((row) => (
                <div
                  key={row.stage}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-sm font-medium text-slate-700">{row.stage}</span>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-orange-700">
                    {formatPoints(row.points)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Referencia
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Este ranking es una foto del momento
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Si el circuito actualiza la planilla, podemos refrescar esta seccion y
              dejarla al dia sin cambiar la experiencia de la app.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
