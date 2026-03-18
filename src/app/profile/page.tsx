"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSession, fetchProfile, updateProfile } from "../../lib/supabase";
import { SectionTitle } from "../../components/SectionTitle";

const categories = [
  "Primera",
  "Segunda",
  "Tercera",
  "Cuarta",
  "Quinta",
  "Principiante"
];

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const session = getSession();

        if (!session?.user?.id || !session?.access_token) return;

        const profile = await fetchProfile(
          session.user.id,
          session.access_token
        );

        if (profile) {
          setName(profile.full_name ?? "");
          setPhone(profile.phone ?? "");
          setCategory(profile.category ?? "");
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const isComplete = useMemo(() => {
    return Boolean(name.trim() && phone.trim() && category.trim());
  }, [name, phone, category]);

  async function save() {
    try {
      setSaving(true);

      const session = getSession();

      if (!session?.user?.id || !session?.access_token) {
        alert("Debes iniciar sesión");
        return;
      }

      await updateProfile(session.user.id, session.access_token, {
        full_name: name || null,
        phone: phone || null,
        category: category || null
      });

      alert("Perfil actualizado");
    } catch {
      alert("No se pudo guardar el perfil");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Cargando perfil...</p>;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link href="/" className="btn-secondary">
        {"← Volver al inicio"}
      </Link>

      <SectionTitle
        title="Mi perfil"
        subtitle="Completá tu información para poder reservar."
      />

      <div className="card rounded-2xl p-5">
        <p className="text-sm text-slate-500">Categoría actual</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">
          {category || "Sin categoría"}
        </p>
      </div>

      {!isComplete ? (
        <div className="card border border-amber-300 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Perfil incompleto</p>
          <p className="mt-1 text-sm text-amber-800">
            Debes completar nombre, teléfono y categoría.
          </p>
        </div>
      ) : (
        <div className="card border border-green-300 bg-green-50 p-4">
          <p className="font-medium text-green-900">Perfil completo</p>
          <p className="mt-1 text-sm text-green-800">
            Ya puedes reservar turnos.
          </p>
        </div>
      )}

      <div className="card space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Nombre</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Teléfono</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Categoría</label>
          <select
            className="w-full rounded-xl border px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Seleccionar</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={save}
          className="btn-primary w-full"
          disabled={saving}
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
