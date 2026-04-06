"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { squashRuleCuriosities, squashRules } from "@/lib/club-content";
import { BEGINNER_CATEGORY_LABEL } from "@/lib/category-labels";
import {
  acknowledgeBeginnerRules,
  fetchBeginnerRulesStatus,
  getSession
} from "@/lib/supabase";

export function BeginnerRulesGate() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const session = getSession();

        if (!session?.user?.id || !session.access_token) {
          if (!cancelled) {
            setOpen(false);
            setShowMoreDetails(false);
            setLoading(false);
          }
          return;
        }

        const status = await fetchBeginnerRulesStatus(session.access_token);

        if (!cancelled) {
          setOpen(Boolean(status.required));
          setShowMoreDetails(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setOpen(false);
          setShowMoreDetails(false);
          setLoading(false);
        }
      }
    }

    void loadStatus();

    const reload = () => {
      setLoading(true);
      void loadStatus();
    };

    window.addEventListener("sr-auth-change", reload);
    window.addEventListener("sr-profile-updated", reload);

    return () => {
      cancelled = true;
      window.removeEventListener("sr-auth-change", reload);
      window.removeEventListener("sr-profile-updated", reload);
    };
  }, []);

  async function handleContinue() {
    try {
      const session = getSession();

      if (!session?.access_token) {
        return;
      }

      setSaving(true);
      await acknowledgeBeginnerRules(session.access_token);
      setOpen(false);
      window.dispatchEvent(new Event("sr-profile-updated"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/70 px-4 py-6">
      <div className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
          Categoría {BEGINNER_CATEGORY_LABEL}
        </p>
        <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Antes de usar la app, mira estas reglas practicas del squash
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
          Como elegiste la categoría {BEGINNER_CATEGORY_LABEL}, te mostramos
          primero un resumen corto del deporte para que entiendas lo esencial
          antes de reservar y empezar a jugar.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {squashRules.map((rule) => (
            <article
              key={rule.title}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <h3 className="text-sm font-semibold text-slate-950 sm:text-base">
                {rule.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {rule.description}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-orange-900">
            Recomendacion rapida
          </p>
          <p className="mt-1 text-sm leading-6 text-orange-800">
            Si hay riesgo de golpear al rival, siempre se frena la jugada. En squash
            la seguridad esta por encima del punto.
          </p>
        </div>

        {showMoreDetails ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Curiosidades y reglas poco conocidas
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {squashRuleCuriosities.map((rule) => (
                <article
                  key={rule.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <h3 className="text-sm font-semibold text-slate-950 sm:text-base">
                    {rule.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {rule.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            className="btn-accent"
            onClick={handleContinue}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Ya lei las reglas, continuar"}
          </button>
          <Link
            href="/docs/reglamento-squash.pdf"
            target="_blank"
            rel="noreferrer"
            className="btn-secondary text-center"
          >
            Ver reglamento completo
          </Link>
          <button
            type="button"
            className="text-left text-sm font-medium text-slate-600 underline"
            onClick={() => setShowMoreDetails((current) => !current)}
          >
            {showMoreDetails ? "Ocultar mas detalles" : "Ver mas detalles"}
          </button>
        </div>
      </div>
    </div>
  );
}
